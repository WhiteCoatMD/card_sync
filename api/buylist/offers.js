/**
 * Buylist Offers API — Dealers make offers, sellers accept/reject
 * POST /api/buylist/offers — dealer makes an offer (auth required)
 * PUT  /api/buylist/offers — seller accepts/rejects an offer (uses seller_token)
 * GET  /api/buylist/offers — dealer views their sent offers (auth required)
 */

const { requireAuth, getUserFromToken } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');

const pool = getPool();

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    // PUT — seller accepts/rejects (public, uses seller_token)
    if (req.method === 'PUT') {
        try {
            const { seller_token, offer_id, action } = req.body;

            if (!seller_token || !offer_id || !action) {
                return res.status(400).json({ success: false, error: 'seller_token, offer_id, and action are required' });
            }

            if (!['accept', 'reject'].includes(action)) {
                return res.status(400).json({ success: false, error: 'action must be accept or reject' });
            }

            // Verify seller owns this submission
            const offerResult = await retryQuery(
                () => pool.query(
                    `SELECT bo.*, b.seller_token, b.id as buylist_id
                     FROM buylist_offers bo
                     JOIN buylist b ON bo.buylist_id = b.id
                     WHERE bo.id = $1 AND b.seller_token = $2`,
                    [offer_id, seller_token]
                ),
                'Offers - Verify seller'
            );

            if (offerResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Offer not found' });
            }

            const offer = offerResult.rows[0];
            const newStatus = action === 'accept' ? 'accepted' : 'rejected';

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                // Update this offer
                await client.query(
                    'UPDATE buylist_offers SET status = $1, updated_at = NOW() WHERE id = $2',
                    [newStatus, offer_id]
                );

                if (action === 'accept') {
                    // Reject all other offers
                    await client.query(
                        "UPDATE buylist_offers SET status = 'rejected', updated_at = NOW() WHERE buylist_id = $1 AND id != $2 AND status = 'pending'",
                        [offer.buylist_id, offer_id]
                    );

                    // Update buylist status and assign dealer
                    await client.query(
                        "UPDATE buylist SET status = 'accepted', dealer_id = $1, total_offer = $2, updated_at = NOW() WHERE id = $3",
                        [offer.dealer_id, offer.total_offer, offer.buylist_id]
                    );
                }

                await client.query('COMMIT');

                return res.status(200).json({
                    success: true,
                    message: action === 'accept'
                        ? 'Offer accepted! The dealer will be in touch to complete the transaction.'
                        : 'Offer rejected.',
                });
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('Offer action error:', error);
            return res.status(500).json({ success: false, error: 'Failed to process offer' });
        }
    }

    // POST and GET require dealer auth
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const token = authHeader.substring(7);
    const user = await getUserFromToken(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    // POST — dealer makes an offer
    if (req.method === 'POST') {
        try {
            const { buylist_id, total_offer, notes, items } = req.body;

            if (!buylist_id || total_offer === undefined) {
                return res.status(400).json({ success: false, error: 'buylist_id and total_offer are required' });
            }

            // Verify submission is marketplace + pending
            const buylistResult = await retryQuery(
                () => pool.query(
                    "SELECT id FROM buylist WHERE id = $1 AND type = 'marketplace' AND status = 'pending'",
                    [buylist_id]
                ),
                'Offers - Verify buylist'
            );

            if (buylistResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Submission not found or no longer accepting offers' });
            }

            // Check if dealer already made an offer
            const existing = await retryQuery(
                () => pool.query(
                    'SELECT id FROM buylist_offers WHERE buylist_id = $1 AND dealer_id = $2',
                    [buylist_id, user.id]
                ),
                'Offers - Check existing'
            );

            if (existing.rows.length > 0) {
                // Update existing offer
                await retryQuery(
                    () => pool.query(
                        'UPDATE buylist_offers SET total_offer = $1, notes = $2, status = $3, updated_at = NOW() WHERE buylist_id = $4 AND dealer_id = $5',
                        [total_offer, notes || null, 'pending', buylist_id, user.id]
                    ),
                    'Offers - Update'
                );

                return res.status(200).json({ success: true, message: 'Offer updated' });
            }

            // Create new offer
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                const offerResult = await client.query(
                    `INSERT INTO buylist_offers (buylist_id, dealer_id, total_offer, notes)
                     VALUES ($1, $2, $3, $4) RETURNING *`,
                    [buylist_id, user.id, total_offer, notes || null]
                );

                const offerId = offerResult.rows[0].id;

                // Insert per-item offers if provided
                if (items && Array.isArray(items)) {
                    for (const item of items) {
                        if (!item.buylist_item_id) continue;
                        await client.query(
                            `INSERT INTO buylist_offer_items (offer_id, buylist_item_id, offer_price)
                             VALUES ($1, $2, $3)`,
                            [offerId, item.buylist_item_id, item.offer_price || 0]
                        );
                    }
                }

                await client.query('COMMIT');

                return res.status(201).json({ success: true, message: 'Offer submitted', offer_id: offerId });
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('Offer create error:', error);
            return res.status(500).json({ success: false, error: 'Failed to submit offer' });
        }
    }

    // GET — dealer views their sent offers
    if (req.method === 'GET') {
        try {
            const result = await retryQuery(
                () => pool.query(
                    `SELECT bo.*, b.customer_name, b.status as buylist_status,
                            (SELECT COUNT(*) FROM buylist_items WHERE buylist_id = b.id) as item_count
                     FROM buylist_offers bo
                     JOIN buylist b ON bo.buylist_id = b.id
                     WHERE bo.dealer_id = $1
                     ORDER BY bo.created_at DESC`,
                    [user.id]
                ),
                'Offers - Dealer list'
            );

            return res.status(200).json({ success: true, offers: result.rows });
        } catch (error) {
            console.error('Offers list error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch offers' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
};
