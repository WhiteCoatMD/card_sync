/**
 * Buylist Marketplace API — Public browse + seller view
 * GET /api/buylist/marketplace — list open marketplace submissions (public)
 * GET /api/buylist/marketplace?seller_token=xxx — seller views their submission + offers
 */

const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');

const pool = getPool();

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { seller_token, page = 1, limit = 50, category } = req.query;

        // Seller checking their own submission + offers
        if (seller_token) {
            const buylistResult = await retryQuery(
                () => pool.query(
                    `SELECT b.*, (SELECT COUNT(*) FROM buylist_items WHERE buylist_id = b.id) as item_count
                     FROM buylist b WHERE b.seller_token = $1`,
                    [seller_token]
                ),
                'Marketplace - Seller lookup'
            );

            if (buylistResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Submission not found' });
            }

            const submission = buylistResult.rows[0];

            // Get items
            const itemsResult = await retryQuery(
                () => pool.query('SELECT * FROM buylist_items WHERE buylist_id = $1 ORDER BY id', [submission.id]),
                'Marketplace - Seller items'
            );

            // Get offers from dealers
            const offersResult = await retryQuery(
                () => pool.query(
                    `SELECT bo.*, u.display_name as dealer_name, u.subdomain
                     FROM buylist_offers bo
                     JOIN users u ON bo.dealer_id = u.id
                     WHERE bo.buylist_id = $1
                     ORDER BY bo.total_offer DESC`,
                    [submission.id]
                ),
                'Marketplace - Seller offers'
            );

            return res.status(200).json({
                success: true,
                submission: { ...submission, items: itemsResult.rows },
                offers: offersResult.rows,
            });
        }

        // Public browse: list open marketplace submissions
        const conditions = ["b.type = 'marketplace'", "b.status = 'pending'"];
        const params = [];
        let paramIndex = 1;

        if (category) {
            conditions.push(`EXISTS (SELECT 1 FROM buylist_items bi WHERE bi.buylist_id = b.id AND bi.category = $${paramIndex++})`);
            params.push(category);
        }

        const where = `WHERE ${conditions.join(' AND ')}`;
        const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
        const lim = Math.min(100, Math.max(1, parseInt(limit)));

        const result = await retryQuery(
            () => pool.query(
                `SELECT b.id, b.customer_name, b.status, b.created_at,
                        (SELECT COUNT(*) FROM buylist_items WHERE buylist_id = b.id) as item_count,
                        (SELECT COALESCE(SUM(asking_price * quantity), 0) FROM buylist_items WHERE buylist_id = b.id) as total_asking,
                        (SELECT COUNT(*) FROM buylist_offers WHERE buylist_id = b.id) as offer_count,
                        (SELECT array_agg(DISTINCT category) FROM buylist_items WHERE buylist_id = b.id AND category IS NOT NULL) as categories
                 FROM buylist b ${where}
                 ORDER BY b.created_at DESC
                 LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
                [...params, lim, offset]
            ),
            'Marketplace - Browse'
        );

        const countResult = await retryQuery(
            () => pool.query(`SELECT COUNT(*) FROM buylist b ${where}`, params),
            'Marketplace - Count'
        );

        return res.status(200).json({
            success: true,
            submissions: result.rows,
            total: parseInt(countResult.rows[0].count),
            page: parseInt(page),
            limit: lim,
        });
    } catch (error) {
        console.error('Marketplace buylist error:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch marketplace' });
    }
};
