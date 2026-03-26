/**
 * Inventory API — List & Create
 * GET  /api/inventory — list/search inventory
 * POST /api/inventory — add a card to inventory
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        try {
            const {
                category, status, search, condition, rarity,
                sort = 'created_at', order = 'desc',
                page = 1, limit = 50
            } = req.query;

            const conditions = [];
            const params = [];
            let paramIndex = 1;

            if (category) {
                conditions.push(`category = $${paramIndex++}`);
                params.push(category);
            }
            if (status) {
                conditions.push(`status = $${paramIndex++}`);
                params.push(status);
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

            const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            const allowedSorts = ['created_at', 'name', 'sell_price', 'buy_price', 'category', 'quantity'];
            const sortCol = allowedSorts.includes(sort) ? sort : 'created_at';
            const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

            const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
            const lim = Math.min(100, Math.max(1, parseInt(limit)));

            const countResult = await retryQuery(
                () => pool.query(`SELECT COUNT(*) FROM inventory ${where}`, params),
                'Inventory - Count'
            );

            const result = await retryQuery(
                () => pool.query(
                    `SELECT * FROM inventory ${where} ORDER BY ${sortCol} ${sortOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
                    [...params, lim, offset]
                ),
                'Inventory - List'
            );

            return res.status(200).json({
                success: true,
                inventory: result.rows,
                total: parseInt(countResult.rows[0].count),
                page: parseInt(page),
                limit: lim
            });
        } catch (error) {
            console.error('Inventory list error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch inventory' });
        }
    }

    if (req.method === 'POST') {
        try {
            const { category, name, set_name, card_number, rarity, condition, quantity, buy_price, sell_price, image_url, description, status } = req.body;

            if (!category || !name) {
                return res.status(400).json({ success: false, error: 'Category and name are required' });
            }

            const result = await retryQuery(
                () => pool.query(
                    `INSERT INTO inventory (category, name, set_name, card_number, rarity, condition, quantity, buy_price, sell_price, image_url, description, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                     RETURNING *`,
                    [
                        category, name, set_name || null, card_number || null,
                        rarity || null, condition || 'near_mint', quantity || 1,
                        buy_price || null, sell_price || null, image_url || null,
                        description || null, status || 'available'
                    ]
                ),
                'Inventory - Create'
            );

            return res.status(201).json({ success: true, item: result.rows[0] });
        } catch (error) {
            console.error('Inventory create error:', error);
            return res.status(500).json({ success: false, error: 'Failed to add inventory item' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
