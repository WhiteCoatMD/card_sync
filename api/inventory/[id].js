/**
 * Inventory Item API — Get, Update, Delete
 * GET    /api/inventory/:id
 * PUT    /api/inventory/:id
 * DELETE /api/inventory/:id
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id } = req.query;
    if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ success: false, error: 'Valid inventory ID is required' });
    }

    if (req.method === 'GET') {
        try {
            const result = await retryQuery(
                () => pool.query('SELECT * FROM inventory WHERE id = $1', [id]),
                'Inventory - Get'
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Item not found' });
            }

            return res.status(200).json({ success: true, item: result.rows[0] });
        } catch (error) {
            console.error('Inventory get error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch item' });
        }
    }

    if (req.method === 'PUT') {
        try {
            const fields = ['category', 'name', 'set_name', 'card_number', 'rarity', 'condition', 'quantity', 'buy_price', 'sell_price', 'image_url', 'description', 'status'];
            const updates = [];
            const params = [];
            let paramIndex = 1;

            for (const field of fields) {
                if (req.body[field] !== undefined) {
                    updates.push(`${field} = $${paramIndex++}`);
                    params.push(req.body[field]);
                }
            }

            if (updates.length === 0) {
                return res.status(400).json({ success: false, error: 'No fields to update' });
            }

            updates.push(`updated_at = NOW()`);
            params.push(id);

            const result = await retryQuery(
                () => pool.query(
                    `UPDATE inventory SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
                    params
                ),
                'Inventory - Update'
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Item not found' });
            }

            return res.status(200).json({ success: true, item: result.rows[0] });
        } catch (error) {
            console.error('Inventory update error:', error);
            return res.status(500).json({ success: false, error: 'Failed to update item' });
        }
    }

    if (req.method === 'DELETE') {
        try {
            const result = await retryQuery(
                () => pool.query('DELETE FROM inventory WHERE id = $1 RETURNING id', [id]),
                'Inventory - Delete'
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Item not found' });
            }

            return res.status(200).json({ success: true, message: 'Item deleted' });
        } catch (error) {
            console.error('Inventory delete error:', error);
            return res.status(500).json({ success: false, error: 'Failed to delete item' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
