/**
 * Marketplace Item Detail API
 * GET /api/buylist/marketplace-item?id=X — get a marketplace submission's cards (for dealers to review)
 */

const { getUserFromToken } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');

const pool = getPool();

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ success: false, error: 'id is required' });

        const buylistResult = await retryQuery(
            () => pool.query(
                "SELECT id, customer_name, status, type, notes, created_at FROM buylist WHERE id = $1 AND type = 'marketplace'",
                [id]
            ),
            'MarketplaceItem - Get'
        );

        if (buylistResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Submission not found' });
        }

        const itemsResult = await retryQuery(
            () => pool.query(
                'SELECT id, card_name, category, set_name, card_number, rarity, condition, quantity, asking_price FROM buylist_items WHERE buylist_id = $1 ORDER BY id',
                [id]
            ),
            'MarketplaceItem - Items'
        );

        // Check if current dealer already has an offer
        let myOffer = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const user = await getUserFromToken(authHeader.substring(7));
            if (user) {
                const offerResult = await retryQuery(
                    () => pool.query(
                        'SELECT * FROM buylist_offers WHERE buylist_id = $1 AND dealer_id = $2',
                        [id, user.id]
                    ),
                    'MarketplaceItem - MyOffer'
                );
                if (offerResult.rows.length > 0) myOffer = offerResult.rows[0];
            }
        }

        const offerCountResult = await retryQuery(
            () => pool.query('SELECT COUNT(*) FROM buylist_offers WHERE buylist_id = $1', [id]),
            'MarketplaceItem - OfferCount'
        );

        return res.status(200).json({
            success: true,
            submission: { ...buylistResult.rows[0], items: itemsResult.rows },
            offer_count: parseInt(offerCountResult.rows[0].count),
            my_offer: myOffer,
        });
    } catch (error) {
        console.error('Marketplace item error:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch submission' });
    }
};
