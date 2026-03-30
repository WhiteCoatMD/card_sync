/**
 * Sales Reports API
 * GET /api/reports — get sales summary for a date range
 * GET /api/reports?export=csv — download CSV for accountant/tax prep
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
        const { period = 'month', start, end, export: exportCsv } = req.query;

        // Calculate date range
        let startDate, endDate;
        const now = new Date();

        if (start && end) {
            startDate = new Date(start);
            endDate = new Date(end);
        } else if (period === 'week') {
            startDate = new Date(now); startDate.setDate(now.getDate() - 7);
            endDate = now;
        } else if (period === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = now;
        } else if (period === 'quarter') {
            const q = Math.floor(now.getMonth() / 3) * 3;
            startDate = new Date(now.getFullYear(), q, 1);
            endDate = now;
        } else if (period === 'year') {
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = now;
        } else {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = now;
        }

        // Summary stats
        const summary = await retryQuery(
            () => pool.query(
                `SELECT
                    COUNT(*) FILTER (WHERE type = 'sell' AND status = 'completed') as total_sales,
                    COALESCE(SUM(total_amount) FILTER (WHERE type = 'sell' AND status = 'completed'), 0) as gross_revenue,
                    COUNT(*) FILTER (WHERE type = 'buy' AND status = 'completed') as total_purchases,
                    COALESCE(SUM(total_amount) FILTER (WHERE type = 'buy' AND status = 'completed'), 0) as total_cost,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending_orders,
                    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders
                 FROM orders
                 WHERE dealer_id = $1 AND created_at >= $2 AND created_at <= $3`,
                [req.user.id, startDate, endDate]
            ),
            'Reports - Summary'
        );

        // Daily breakdown
        const daily = await retryQuery(
            () => pool.query(
                `SELECT DATE(created_at) as date,
                        COUNT(*) FILTER (WHERE type = 'sell' AND status = 'completed') as sales,
                        COALESCE(SUM(total_amount) FILTER (WHERE type = 'sell' AND status = 'completed'), 0) as revenue,
                        COUNT(*) FILTER (WHERE type = 'buy' AND status = 'completed') as purchases,
                        COALESCE(SUM(total_amount) FILTER (WHERE type = 'buy' AND status = 'completed'), 0) as cost
                 FROM orders
                 WHERE dealer_id = $1 AND created_at >= $2 AND created_at <= $3
                 GROUP BY DATE(created_at) ORDER BY date DESC`,
                [req.user.id, startDate, endDate]
            ),
            'Reports - Daily'
        );

        // Top selling items
        const topItems = await retryQuery(
            () => pool.query(
                `SELECT i.name, i.category, SUM(oi.quantity) as qty_sold, SUM(oi.quantity * oi.unit_price) as revenue
                 FROM order_items oi
                 JOIN orders o ON oi.order_id = o.id
                 LEFT JOIN inventory i ON oi.inventory_id = i.id
                 WHERE o.dealer_id = $1 AND o.type = 'sell' AND o.status = 'completed'
                   AND o.created_at >= $2 AND o.created_at <= $3
                 GROUP BY i.name, i.category
                 ORDER BY revenue DESC LIMIT 20`,
                [req.user.id, startDate, endDate]
            ),
            'Reports - Top Items'
        );

        // Shipping costs
        const shippingCosts = await retryQuery(
            () => pool.query(
                `SELECT COALESCE(SUM(rate_amount), 0) as total_shipping, COUNT(*) as labels_purchased
                 FROM shipments
                 WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3`,
                [req.user.id, startDate, endDate]
            ),
            'Reports - Shipping'
        );

        // CSV export
        if (exportCsv === 'csv') {
            const orders = await retryQuery(
                () => pool.query(
                    `SELECT o.id, o.type, o.status, o.customer_name, o.customer_email, o.total_amount,
                            o.shipping_tracking, o.shipping_carrier, o.created_at,
                            (SELECT string_agg(COALESCE(i.name, 'Unknown') || ' x' || oi.quantity || ' @ $' || oi.unit_price, '; ')
                             FROM order_items oi LEFT JOIN inventory i ON oi.inventory_id = i.id WHERE oi.order_id = o.id) as items
                     FROM orders o
                     WHERE o.dealer_id = $1 AND o.created_at >= $2 AND o.created_at <= $3
                     ORDER BY o.created_at DESC`,
                    [req.user.id, startDate, endDate]
                ),
                'Reports - CSV'
            );

            const csvHeaders = 'Order ID,Type,Status,Customer,Email,Total,Items,Tracking,Carrier,Date';
            const csvRows = orders.rows.map(o =>
                [o.id, o.type, o.status,
                 '"' + (o.customer_name || '').replace(/"/g, '""') + '"',
                 o.customer_email || '',
                 parseFloat(o.total_amount).toFixed(2),
                 '"' + (o.items || '').replace(/"/g, '""') + '"',
                 o.shipping_tracking || '',
                 o.shipping_carrier || '',
                 new Date(o.created_at).toISOString().split('T')[0]
                ].join(',')
            );

            const csv = csvHeaders + '\n' + csvRows.join('\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="collect-sync-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv"`);
            return res.status(200).send(csv);
        }

        return res.status(200).json({
            success: true,
            period: { start: startDate, end: endDate },
            summary: summary.rows[0],
            shipping: shippingCosts.rows[0],
            daily: daily.rows,
            top_items: topItems.rows,
        });
    } catch (error) {
        console.error('Reports error:', error);
        return res.status(500).json({ success: false, error: 'Failed to generate report' });
    }
});
