/**
 * Low stock alert system
 * Checks inventory quantity against dealer's threshold and creates alerts
 */

const { getPool } = require('./db');
const { retryQuery } = require('./db-retry');

const pool = getPool();

/**
 * Check a single item and create alert if below threshold
 * Called after any quantity change (sell order, manual edit, webhook)
 */
async function checkAndAlertLowStock(userId, inventoryId) {
    try {
        // Get user settings and item info in one query
        const result = await retryQuery(
            () => pool.query(
                `SELECT i.id, i.name, i.quantity, u.low_stock_threshold, u.low_stock_alerts_enabled, u.email
                 FROM inventory i
                 JOIN users u ON i.user_id = u.id
                 WHERE i.id = $1 AND i.user_id = $2`,
                [inventoryId, userId]
            ),
            'StockAlert - Check item'
        );

        if (result.rows.length === 0) return;
        const { name, quantity, low_stock_threshold, low_stock_alerts_enabled, email } = result.rows[0];

        if (quantity > low_stock_threshold) return;

        // Check if unacknowledged alert already exists
        const existing = await retryQuery(
            () => pool.query(
                'SELECT id FROM low_stock_alerts WHERE user_id = $1 AND inventory_id = $2 AND acknowledged_at IS NULL',
                [userId, inventoryId]
            ),
            'StockAlert - Check existing'
        );

        if (existing.rows.length > 0) {
            // Update the quantity on existing alert
            await retryQuery(
                () => pool.query(
                    'UPDATE low_stock_alerts SET current_quantity = $1 WHERE id = $2',
                    [quantity, existing.rows[0].id]
                ),
                'StockAlert - Update existing'
            );
            return;
        }

        // Create new alert
        await retryQuery(
            () => pool.query(
                `INSERT INTO low_stock_alerts (user_id, inventory_id, card_name, current_quantity, threshold)
                 VALUES ($1, $2, $3, $4, $5)`,
                [userId, inventoryId, name, quantity, low_stock_threshold]
            ),
            'StockAlert - Create'
        );

        // Send email if enabled
        if (low_stock_alerts_enabled && email) {
            try {
                const { sendEmail } = require('./email');
                if (sendEmail) {
                    await sendEmail({
                        to: email,
                        subject: `Low Stock Alert — ${name}`,
                        html: `<h3>Low Stock Alert</h3>
                               <p><strong>${name}</strong> is down to <strong>${quantity}</strong> (threshold: ${low_stock_threshold}).</p>
                               <p><a href="https://collect-sync.com/inventory.html">View Inventory</a></p>`,
                    });

                    await retryQuery(
                        () => pool.query(
                            'UPDATE low_stock_alerts SET email_sent_at = NOW() WHERE user_id = $1 AND inventory_id = $2 AND acknowledged_at IS NULL',
                            [userId, inventoryId]
                        ),
                        'StockAlert - Mark emailed'
                    );
                }
            } catch (e) {
                console.error('StockAlert email error:', e.message);
            }
        }
    } catch (e) {
        console.error('checkAndAlertLowStock error:', e.message);
    }
}

/**
 * Get all unacknowledged low stock alerts for a user
 */
async function getLowStockAlerts(userId) {
    const result = await retryQuery(
        () => pool.query(
            `SELECT a.*, i.image_url, i.sell_price, i.quantity as live_quantity
             FROM low_stock_alerts a
             LEFT JOIN inventory i ON a.inventory_id = i.id
             WHERE a.user_id = $1 AND a.acknowledged_at IS NULL
             ORDER BY a.created_at DESC`,
            [userId]
        ),
        'StockAlert - Get all'
    );
    return result.rows;
}

/**
 * Acknowledge alerts
 */
async function acknowledgeAlerts(userId, alertIds) {
    if (!alertIds || alertIds.length === 0) return;
    const placeholders = alertIds.map((_, i) => `$${i + 2}`).join(',');
    await retryQuery(
        () => pool.query(
            `UPDATE low_stock_alerts SET acknowledged_at = NOW() WHERE user_id = $1 AND id IN (${placeholders})`,
            [userId, ...alertIds]
        ),
        'StockAlert - Acknowledge'
    );
}

module.exports = { checkAndAlertLowStock, getLowStockAlerts, acknowledgeAlerts };
