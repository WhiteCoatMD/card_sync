/**
 * Live Sales Import API — quick entry for post-stream sales
 * POST /api/live-sales — bulk create sell orders from a live show
 * GET  /api/live-sales — list recent live sale batches
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
        const result = await retryQuery(
            () => pool.query(
                `SELECT o.id, o.customer_name, o.total_amount, o.status, o.notes, o.created_at,
                        o.shipping_tracking,
                        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
                 FROM orders o
                 WHERE o.dealer_id = $1 AND o.notes LIKE '%[Live Sale]%'
                 ORDER BY o.created_at DESC LIMIT 100`,
                [req.user.id]
            ),
            'LiveSales - List'
        );
        return res.status(200).json({ success: true, sales: result.rows });
    }

    if (req.method === 'POST') {
        try {
            const { platform, sales } = req.body;

            if (!sales || !Array.isArray(sales) || sales.length === 0) {
                return res.status(400).json({ success: false, error: 'At least one sale is required' });
            }

            const platformLabel = platform || 'Live Sale';
            const client = await pool.connect();
            const results = { created: 0, errors: [] };

            try {
                await client.query('BEGIN');

                for (const sale of sales) {
                    if (!sale.buyer_name) { results.errors.push('Missing buyer name'); continue; }
                    if (!sale.items || sale.items.length === 0) { results.errors.push(`${sale.buyer_name}: no items`); continue; }

                    // Calculate total
                    let total = 0;
                    const orderItems = [];

                    for (const item of sale.items) {
                        const price = parseFloat(item.price) || 0;
                        const qty = parseInt(item.quantity) || 1;
                        total += price * qty;

                        // Try to match to inventory by name
                        let inventoryId = item.inventory_id || null;
                        if (!inventoryId && item.card_name) {
                            const match = await client.query(
                                "SELECT id FROM inventory WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND status = 'available' AND quantity > 0 LIMIT 1",
                                [req.user.id, item.card_name.trim()]
                            );
                            if (match.rows.length > 0) inventoryId = match.rows[0].id;
                        }

                        orderItems.push({ inventoryId, cardName: item.card_name || 'Unknown', qty, price });
                    }

                    // Create order
                    const orderResult = await client.query(
                        `INSERT INTO orders (dealer_id, user_id, customer_name, type, status, total_amount, notes, customer_email)
                         VALUES ($1, $1, $2, 'sell', 'completed', $3, $4, $5) RETURNING id`,
                        [req.user.id, sale.buyer_name, total,
                         `[Live Sale] ${platformLabel}` + (sale.notes ? ' — ' + sale.notes : ''),
                         sale.buyer_email || null]
                    );
                    const orderId = orderResult.rows[0].id;

                    // Create order items + decrement inventory
                    for (const oi of orderItems) {
                        await client.query(
                            'INSERT INTO order_items (order_id, inventory_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
                            [orderId, oi.inventoryId, oi.qty, oi.price]
                        );

                        if (oi.inventoryId) {
                            await client.query(
                                'UPDATE inventory SET quantity = GREATEST(0, quantity - $1), updated_at = NOW() WHERE id = $2',
                                [oi.qty, oi.inventoryId]
                            );
                            await client.query(
                                "UPDATE inventory SET status = 'sold' WHERE id = $1 AND quantity <= 0",
                                [oi.inventoryId]
                            );
                        }
                    }

                    // Add shipping address if provided
                    if (sale.shipping_address) {
                        await client.query(
                            'UPDATE orders SET shipping_address = $1 WHERE id = $2',
                            [JSON.stringify(sale.shipping_address), orderId]
                        );
                    }

                    results.created++;
                }

                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }

            // Trigger low stock alerts
            try {
                const { checkAndAlertLowStock } = require('../../lib/stock-alerts');
                for (const sale of sales) {
                    for (const item of (sale.items || [])) {
                        if (item.inventory_id) {
                            checkAndAlertLowStock(req.user.id, item.inventory_id).catch(() => {});
                        }
                    }
                }
            } catch (e) {}

            return res.status(201).json({
                success: true,
                message: `Created ${results.created} orders from ${platformLabel}`,
                created: results.created,
                errors: results.errors.length > 0 ? results.errors : undefined,
            });
        } catch (error) {
            console.error('Live sales import error:', error);
            return res.status(500).json({ success: false, error: 'Import failed' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
