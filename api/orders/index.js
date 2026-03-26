/**
 * Orders API — List & Create
 * GET  /api/orders — list orders
 * POST /api/orders — create a buy/sell order
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
            const { type, status, page = 1, limit = 50 } = req.query;

            const conditions = [];
            const params = [];
            let paramIndex = 1;

            if (type) {
                conditions.push(`o.type = $${paramIndex++}`);
                params.push(type);
            }
            if (status) {
                conditions.push(`o.status = $${paramIndex++}`);
                params.push(status);
            }

            const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
            const lim = Math.min(100, Math.max(1, parseInt(limit)));

            const countResult = await retryQuery(
                () => pool.query(`SELECT COUNT(*) FROM orders o ${where}`, params),
                'Orders - Count'
            );

            const result = await retryQuery(
                () => pool.query(
                    `SELECT o.*, u.email as user_email, u.display_name as user_display_name,
                            (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
                     FROM orders o
                     LEFT JOIN users u ON o.user_id = u.id
                     ${where}
                     ORDER BY o.created_at DESC
                     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
                    [...params, lim, offset]
                ),
                'Orders - List'
            );

            return res.status(200).json({
                success: true,
                orders: result.rows,
                total: parseInt(countResult.rows[0].count),
                page: parseInt(page),
                limit: lim
            });
        } catch (error) {
            console.error('Orders list error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch orders' });
        }
    }

    if (req.method === 'POST') {
        const client = await pool.connect();
        try {
            const { type, customer_name, notes, items } = req.body;

            if (!type || !['buy', 'sell'].includes(type)) {
                return res.status(400).json({ success: false, error: 'Type must be "buy" or "sell"' });
            }
            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ success: false, error: 'At least one item is required' });
            }

            await client.query('BEGIN');

            // Calculate total
            let totalAmount = 0;
            for (const item of items) {
                totalAmount += (parseFloat(item.unit_price) || 0) * (parseInt(item.quantity) || 1);
            }

            // Create order
            const orderResult = await client.query(
                `INSERT INTO orders (user_id, customer_name, type, status, total_amount, notes)
                 VALUES ($1, $2, $3, 'completed', $4, $5)
                 RETURNING *`,
                [req.user.id, customer_name || null, type, totalAmount, notes || null]
            );
            const order = orderResult.rows[0];

            // Create order items and update inventory
            const orderItems = [];
            for (const item of items) {
                const qty = parseInt(item.quantity) || 1;
                const unitPrice = parseFloat(item.unit_price) || 0;

                const itemResult = await client.query(
                    `INSERT INTO order_items (order_id, inventory_id, quantity, unit_price)
                     VALUES ($1, $2, $3, $4)
                     RETURNING *`,
                    [order.id, item.inventory_id || null, qty, unitPrice]
                );
                orderItems.push(itemResult.rows[0]);

                // Update inventory quantity if linked to an inventory item
                if (item.inventory_id) {
                    if (type === 'sell') {
                        // Selling to customer: decrease stock
                        await client.query(
                            `UPDATE inventory SET quantity = GREATEST(0, quantity - $1), updated_at = NOW() WHERE id = $2`,
                            [qty, item.inventory_id]
                        );
                    } else {
                        // Buying from customer: increase stock
                        await client.query(
                            `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`,
                            [qty, item.inventory_id]
                        );
                    }
                }
            }

            await client.query('COMMIT');

            return res.status(201).json({
                success: true,
                order: { ...order, items: orderItems }
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Order create error:', error);
            return res.status(500).json({ success: false, error: 'Failed to create order' });
        } finally {
            client.release();
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
