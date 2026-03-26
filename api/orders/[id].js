/**
 * Order Detail API
 * GET /api/orders/:id — get order with items
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
        return res.status(400).json({ success: false, error: 'Valid order ID is required' });
    }

    if (req.method === 'GET') {
        try {
            const orderResult = await retryQuery(
                () => pool.query(
                    `SELECT o.*, u.email as user_email, u.display_name as user_display_name
                     FROM orders o
                     LEFT JOIN users u ON o.user_id = u.id
                     WHERE o.id = $1`,
                    [id]
                ),
                'Order - Get'
            );

            if (orderResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Order not found' });
            }

            const itemsResult = await retryQuery(
                () => pool.query(
                    `SELECT oi.*, i.name as card_name, i.category, i.set_name, i.card_number, i.condition, i.image_url
                     FROM order_items oi
                     LEFT JOIN inventory i ON oi.inventory_id = i.id
                     WHERE oi.order_id = $1
                     ORDER BY oi.id`,
                    [id]
                ),
                'Order - Get Items'
            );

            return res.status(200).json({
                success: true,
                order: {
                    ...orderResult.rows[0],
                    items: itemsResult.rows
                }
            });
        } catch (error) {
            console.error('Order get error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch order' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
