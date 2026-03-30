/**
 * Daily price alert check cron
 * Checks market prices against user-set thresholds
 * GET /api/cron/price-alerts
 */

const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { searchPricing } = require('../../lib/pricing');

const pool = getPool();

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && (!authHeader || authHeader !== `Bearer ${cronSecret}`)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Get all active, untriggered alerts
        const alerts = await retryQuery(
            () => pool.query(
                'SELECT * FROM price_alerts WHERE active = true AND triggered = false ORDER BY created_at LIMIT 50'
            ),
            'Cron PriceAlerts - Get alerts'
        );

        let checked = 0;
        let triggered = 0;

        for (const alert of alerts.rows) {
            try {
                const result = await searchPricing(alert.card_name, alert.category, null);
                if (!result.results || result.results.length === 0) continue;

                // Get best match price
                const best = result.results[0];
                const marketPrice = best.market_price;
                if (marketPrice === null) continue;

                checked++;

                // Update last checked price
                await pool.query(
                    'UPDATE price_alerts SET last_checked_price = $1 WHERE id = $2',
                    [marketPrice, alert.id]
                );

                // Check if threshold crossed
                const shouldTrigger =
                    (alert.direction === 'above' && marketPrice >= parseFloat(alert.target_price)) ||
                    (alert.direction === 'below' && marketPrice <= parseFloat(alert.target_price));

                if (shouldTrigger) {
                    await pool.query(
                        'UPDATE price_alerts SET triggered = true, triggered_at = NOW(), triggered_price = $1 WHERE id = $2',
                        [marketPrice, alert.id]
                    );
                    triggered++;

                    // Try to send email
                    try {
                        const userResult = await pool.query('SELECT email, display_name FROM users WHERE id = $1', [alert.user_id]);
                        const user = userResult.rows[0];
                        if (user && user.email) {
                            const { sendEmail } = require('../../lib/email');
                            if (sendEmail) {
                                const dir = alert.direction === 'above' ? 'risen above' : 'dropped below';
                                await sendEmail({
                                    to: user.email,
                                    subject: `Price Alert: ${alert.card_name} has ${dir} $${parseFloat(alert.target_price).toFixed(2)}`,
                                    html: `<h3>Price Alert Triggered</h3>
                                           <p><strong>${alert.card_name}</strong> market price is now <strong>$${marketPrice.toFixed(2)}</strong>.</p>
                                           <p>Your alert: ${dir} $${parseFloat(alert.target_price).toFixed(2)}</p>
                                           <p><a href="https://collect-sync.com/inventory.html">View Inventory</a></p>`,
                                });
                            }
                        }
                    } catch (e) {
                        console.error('Price alert email error:', e.message);
                    }
                }

                // Rate limit
                await new Promise(r => setTimeout(r, 300));
            } catch (e) {
                console.error('Price alert check error for', alert.card_name, e.message);
            }
        }

        return res.status(200).json({
            success: true,
            total_alerts: alerts.rows.length,
            checked,
            triggered,
        });
    } catch (error) {
        console.error('Price alerts cron error:', error);
        return res.status(500).json({ error: 'Cron job failed' });
    }
};
