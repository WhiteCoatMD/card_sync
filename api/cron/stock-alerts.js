/**
 * Daily stock alert cron job
 * Scans all dealers with alerts enabled for low stock items
 * Sends digest email with all items below threshold
 *
 * Secured via CRON_SECRET header check
 * GET /api/cron/stock-alerts
 */

const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');

const pool = getPool();

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    // Verify cron secret
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && (!authHeader || authHeader !== `Bearer ${cronSecret}`)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Get all dealers with alerts enabled
        const dealers = await retryQuery(
            () => pool.query(
                'SELECT id, email, display_name, low_stock_threshold FROM users WHERE low_stock_alerts_enabled = true AND role = $1',
                ['owner']
            ),
            'Cron - Get dealers'
        );

        let totalAlerts = 0;

        for (const dealer of dealers.rows) {
            // Find items below threshold without unacknowledged alerts
            const lowItems = await retryQuery(
                () => pool.query(
                    `SELECT i.id, i.name, i.quantity FROM inventory i
                     WHERE i.user_id = $1 AND i.status = 'available' AND i.quantity <= $2
                       AND NOT EXISTS (
                           SELECT 1 FROM low_stock_alerts a
                           WHERE a.inventory_id = i.id AND a.user_id = $1 AND a.acknowledged_at IS NULL
                       )`,
                    [dealer.id, dealer.low_stock_threshold]
                ),
                'Cron - Find low stock'
            );

            if (lowItems.rows.length === 0) continue;

            // Create alert records
            for (const item of lowItems.rows) {
                try {
                    await pool.query(
                        `INSERT INTO low_stock_alerts (user_id, inventory_id, card_name, current_quantity, threshold)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT DO NOTHING`,
                        [dealer.id, item.id, item.name, item.quantity, dealer.low_stock_threshold]
                    );
                } catch (e) { /* unique constraint, skip */ }
            }

            // Send digest email
            if (dealer.email) {
                try {
                    const { sendEmail } = require('../../lib/email');
                    if (sendEmail) {
                        const itemList = lowItems.rows.map(i =>
                            `<li><strong>${i.name}</strong> — ${i.quantity} remaining</li>`
                        ).join('');

                        await sendEmail({
                            to: dealer.email,
                            subject: `Low Stock Alert — ${lowItems.rows.length} items need restocking`,
                            html: `<h3>Daily Low Stock Report</h3>
                                   <p>Hi ${dealer.display_name || 'Dealer'},</p>
                                   <p>The following items are at or below your threshold of ${dealer.low_stock_threshold}:</p>
                                   <ul>${itemList}</ul>
                                   <p><a href="https://collect-sync.com/inventory.html">View Inventory</a></p>`,
                        });

                        await pool.query(
                            `UPDATE low_stock_alerts SET email_sent_at = NOW()
                             WHERE user_id = $1 AND acknowledged_at IS NULL AND email_sent_at IS NULL`,
                            [dealer.id]
                        );
                    }
                } catch (e) {
                    console.error('Cron email error for dealer', dealer.id, e.message);
                }
            }

            totalAlerts += lowItems.rows.length;
        }

        return res.status(200).json({
            success: true,
            dealers_checked: dealers.rows.length,
            alerts_created: totalAlerts,
        });
    } catch (error) {
        console.error('Stock alerts cron error:', error);
        return res.status(500).json({ error: 'Cron job failed' });
    }
};
