/**
 * Inventory Stats API
 * GET /api/inventory/stats — dashboard statistics
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const inventoryStats = await retryQuery(
            () => pool.query(`
                SELECT
                    COUNT(*) as total_cards,
                    COALESCE(SUM(quantity), 0) as total_quantity,
                    COALESCE(SUM(CASE WHEN status = 'available' THEN quantity ELSE 0 END), 0) as available_quantity,
                    COALESCE(SUM(sell_price * quantity), 0) as total_retail_value,
                    COALESCE(SUM(buy_price * quantity), 0) as total_cost,
                    COUNT(DISTINCT category) as category_count
                FROM inventory
            `),
            'Stats - Inventory'
        );

        const orderStats = await retryQuery(
            () => pool.query(`
                SELECT
                    COUNT(*) as total_orders,
                    COALESCE(SUM(CASE WHEN type = 'sell' THEN total_amount ELSE 0 END), 0) as total_sales,
                    COALESCE(SUM(CASE WHEN type = 'buy' THEN total_amount ELSE 0 END), 0) as total_purchases,
                    COUNT(CASE WHEN type = 'sell' THEN 1 END) as sale_count,
                    COUNT(CASE WHEN type = 'buy' THEN 1 END) as purchase_count
                FROM orders WHERE status = 'completed'
            `),
            'Stats - Orders'
        );

        const recentOrders = await retryQuery(
            () => pool.query(`
                SELECT o.id, o.type, o.customer_name, o.total_amount, o.created_at,
                       (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
                FROM orders o
                ORDER BY o.created_at DESC LIMIT 5
            `),
            'Stats - Recent Orders'
        );

        return res.status(200).json({
            success: true,
            inventory: inventoryStats.rows[0],
            orders: orderStats.rows[0],
            recentOrders: recentOrders.rows
        });
    } catch (error) {
        console.error('Stats error:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
});
