/**
 * Analytics API
 * GET /api/analytics — detailed analytics for the dealer
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { hasFeature } = require('../../lib/plans');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    if (!hasFeature(req.user.plan, 'analytics')) {
        return res.status(403).json({ success: false, error: 'Analytics requires Pro plan or higher.', upgrade_required: true });
    }

    try {
        const { period = '30' } = req.query;
        const days = Math.min(365, Math.max(7, parseInt(period)));

        // Inventory summary
        const inventoryStats = await retryQuery(() => pool.query(`
            SELECT
                COUNT(*) as total_cards,
                COALESCE(SUM(quantity), 0) as total_quantity,
                COALESCE(SUM(sell_price * quantity), 0) as total_retail_value,
                COALESCE(SUM(buy_price * quantity), 0) as total_cost,
                COALESCE(SUM(sell_price * quantity) - SUM(buy_price * quantity), 0) as potential_profit,
                COUNT(DISTINCT category) as category_count
            FROM inventory
        `), 'Analytics - Inventory');

        // Category breakdown
        const categoryBreakdown = await retryQuery(() => pool.query(`
            SELECT category,
                   COUNT(*) as card_count,
                   COALESCE(SUM(quantity), 0) as total_quantity,
                   COALESCE(SUM(sell_price * quantity), 0) as retail_value,
                   COALESCE(SUM(buy_price * quantity), 0) as cost
            FROM inventory
            GROUP BY category ORDER BY retail_value DESC
        `), 'Analytics - Categories');

        // Sales & purchases over period
        const salesStats = await retryQuery(() => pool.query(`
            SELECT
                COALESCE(SUM(CASE WHEN type = 'sell' THEN total_amount ELSE 0 END), 0) as total_sales,
                COALESCE(SUM(CASE WHEN type = 'buy' THEN total_amount ELSE 0 END), 0) as total_purchases,
                COUNT(CASE WHEN type = 'sell' THEN 1 END) as sale_count,
                COUNT(CASE WHEN type = 'buy' THEN 1 END) as purchase_count
            FROM orders
            WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '1 day' * $1
        `, [days]), 'Analytics - Sales');

        // Daily revenue trend
        const dailyTrend = await retryQuery(() => pool.query(`
            SELECT DATE(created_at) as date,
                   COALESCE(SUM(CASE WHEN type = 'sell' THEN total_amount ELSE 0 END), 0) as sales,
                   COALESCE(SUM(CASE WHEN type = 'buy' THEN total_amount ELSE 0 END), 0) as purchases,
                   COUNT(*) as order_count
            FROM orders
            WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '1 day' * $1
            GROUP BY DATE(created_at) ORDER BY date
        `, [days]), 'Analytics - Daily Trend');

        // Top selling cards
        const topSellers = await retryQuery(() => pool.query(`
            SELECT i.name, i.category, i.set_name,
                   SUM(oi.quantity) as total_sold,
                   SUM(oi.quantity * oi.unit_price) as total_revenue
            FROM order_items oi
            JOIN inventory i ON oi.inventory_id = i.id
            JOIN orders o ON oi.order_id = o.id
            WHERE o.type = 'sell' AND o.status = 'completed'
                  AND o.created_at >= NOW() - INTERVAL '1 day' * $1
            GROUP BY i.id, i.name, i.category, i.set_name
            ORDER BY total_revenue DESC LIMIT 10
        `, [days]), 'Analytics - Top Sellers');

        // Inventory aging (cards sitting longest without selling)
        const aging = await retryQuery(() => pool.query(`
            SELECT id, name, category, set_name, sell_price, quantity, created_at,
                   EXTRACT(DAY FROM NOW() - created_at) as days_listed
            FROM inventory
            WHERE status = 'available' AND quantity > 0
            ORDER BY created_at ASC LIMIT 10
        `), 'Analytics - Aging');

        // Profit margins by category
        const margins = await retryQuery(() => pool.query(`
            SELECT i.category,
                   COALESCE(AVG(i.sell_price - i.buy_price), 0) as avg_margin,
                   COALESCE(AVG(CASE WHEN i.buy_price > 0 THEN ((i.sell_price - i.buy_price) / i.buy_price * 100) END), 0) as avg_margin_pct
            FROM inventory i
            WHERE i.sell_price IS NOT NULL AND i.buy_price IS NOT NULL AND i.buy_price > 0
            GROUP BY i.category ORDER BY avg_margin_pct DESC
        `), 'Analytics - Margins');

        return res.status(200).json({
            success: true,
            period: days,
            inventory: inventoryStats.rows[0],
            categories: categoryBreakdown.rows,
            sales: salesStats.rows[0],
            daily_trend: dailyTrend.rows,
            top_sellers: topSellers.rows,
            aging: aging.rows,
            margins: margins.rows,
        });
    } catch (error) {
        console.error('Analytics error:', error);
        return res.status(500).json({ success: false, error: 'Failed to load analytics' });
    }
});
