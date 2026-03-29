/**
 * Buylist API — Dealer view
 * GET  /api/buylist — list buylist submissions
 * POST /api/buylist — (public) submit cards to sell
 */

const { requireAuth, getUserFromToken } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');

const pool = getPool();

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();

    // POST is public (customers submitting)
    if (req.method === 'POST') {
        try {
            const { dealer_id, customer_name, customer_email, customer_phone, notes, items, type } = req.body;

            const submissionType = type === 'marketplace' ? 'marketplace' : 'direct';

            if (submissionType === 'direct' && !dealer_id) {
                return res.status(400).json({ success: false, error: 'dealer_id is required for direct submissions' });
            }
            if (!customer_name) return res.status(400).json({ success: false, error: 'Your name is required' });
            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ success: false, error: 'At least one card is required' });
            }

            // Generate a seller token so they can check back on their submission
            const crypto = require('crypto');
            const sellerToken = crypto.randomBytes(32).toString('hex');

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                const buylistResult = await client.query(
                    `INSERT INTO buylist (dealer_id, customer_name, customer_email, customer_phone, notes, type, seller_token)
                     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                    [submissionType === 'direct' ? dealer_id : null, customer_name,
                     customer_email || null, customer_phone || null, notes || null,
                     submissionType, sellerToken]
                );
                const buylist = buylistResult.rows[0];

                for (const item of items) {
                    if (!item.card_name) continue;
                    await client.query(
                        `INSERT INTO buylist_items (buylist_id, card_name, category, set_name, card_number, rarity, condition, quantity, asking_price)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                        [buylist.id, item.card_name, item.category || null, item.set_name || null,
                         item.card_number || null, item.rarity || null, item.condition || 'near_mint',
                         item.quantity || 1, item.asking_price || null]
                    );
                }

                await client.query('COMMIT');

                const message = submissionType === 'marketplace'
                    ? 'Your cards have been posted to the marketplace! Dealers will start making offers.'
                    : 'Your cards have been submitted! The dealer will review and get back to you.';

                return res.status(201).json({
                    success: true,
                    message,
                    buylist_id: buylist.id,
                    seller_token: sellerToken,
                });
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('Buylist submit error:', error);
            return res.status(500).json({ success: false, error: 'Failed to submit buylist' });
        }
    }

    // GET requires auth (dealer viewing their submissions)
    if (req.method === 'GET') {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        const token = authHeader.substring(7);
        const user = await getUserFromToken(token);
        if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

        try {
            const { status, page = 1, limit = 50 } = req.query;
            const conditions = ['b.dealer_id = $1'];
            const params = [user.id];
            let paramIndex = 2;

            if (status) {
                conditions.push(`b.status = $${paramIndex++}`);
                params.push(status);
            }

            const where = `WHERE ${conditions.join(' AND ')}`;
            const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
            const lim = Math.min(100, Math.max(1, parseInt(limit)));

            const result = await retryQuery(
                () => pool.query(
                    `SELECT b.*, (SELECT COUNT(*) FROM buylist_items WHERE buylist_id = b.id) as item_count
                     FROM buylist b ${where}
                     ORDER BY b.created_at DESC
                     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
                    [...params, lim, offset]
                ),
                'Buylist - List'
            );

            const countResult = await retryQuery(
                () => pool.query(`SELECT COUNT(*) FROM buylist b ${where}`, params),
                'Buylist - Count'
            );

            return res.status(200).json({
                success: true,
                submissions: result.rows,
                total: parseInt(countResult.rows[0].count),
                page: parseInt(page),
                limit: lim,
            });
        } catch (error) {
            console.error('Buylist list error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch buylist' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
};
