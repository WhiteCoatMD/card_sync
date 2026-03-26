/**
 * Public Marketplace API — No auth required
 * GET /api/public/marketplace — browse available cards
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
        const {
            category, search, condition, rarity,
            min_price, max_price,
            sort = 'created_at', order = 'desc',
            page = 1, limit = 50
        } = req.query;

        const conditions = ["status = 'available'", 'quantity > 0'];
        const params = [];
        let paramIndex = 1;

        if (category) {
            conditions.push(`category = $${paramIndex++}`);
            params.push(category);
        }
        if (condition) {
            conditions.push(`condition = $${paramIndex++}`);
            params.push(condition);
        }
        if (rarity) {
            conditions.push(`rarity = $${paramIndex++}`);
            params.push(rarity);
        }
        if (search) {
            conditions.push(`(name ILIKE $${paramIndex} OR set_name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }
        if (min_price) {
            conditions.push(`sell_price >= $${paramIndex++}`);
            params.push(parseFloat(min_price));
        }
        if (max_price) {
            conditions.push(`sell_price <= $${paramIndex++}`);
            params.push(parseFloat(max_price));
        }

        const where = `WHERE ${conditions.join(' AND ')}`;

        const allowedSorts = ['created_at', 'name', 'sell_price', 'category'];
        const sortCol = allowedSorts.includes(sort) ? sort : 'created_at';
        const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

        const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
        const lim = Math.min(100, Math.max(1, parseInt(limit)));

        const countResult = await retryQuery(
            () => pool.query(`SELECT COUNT(*) FROM inventory ${where}`, params),
            'Marketplace - Count'
        );

        // Only return public-facing fields (no buy_price)
        const result = await retryQuery(
            () => pool.query(
                `SELECT id, category, name, set_name, card_number, rarity, condition, quantity, sell_price, image_url, description, created_at
                 FROM inventory ${where}
                 ORDER BY ${sortCol} ${sortOrder}
                 LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
                [...params, lim, offset]
            ),
            'Marketplace - List'
        );

        // Get available categories for filtering
        const categoriesResult = await retryQuery(
            () => pool.query(
                `SELECT DISTINCT category, COUNT(*) as count
                 FROM inventory WHERE status = 'available' AND quantity > 0
                 GROUP BY category ORDER BY category`
            ),
            'Marketplace - Categories'
        );

        return res.status(200).json({
            success: true,
            cards: result.rows,
            categories: categoriesResult.rows,
            total: parseInt(countResult.rows[0].count),
            page: parseInt(page),
            limit: lim
        });
    } catch (error) {
        console.error('Marketplace error:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch marketplace' });
    }
};
