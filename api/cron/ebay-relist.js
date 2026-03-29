/**
 * Daily eBay relist cron job
 * Checks one dealer per run for ended listings and relists them
 * GET /api/cron/ebay-relist
 */

const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { getValidToken, getSellerEndedListings, relistItem } = require('../../lib/ebay');

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
        // Pick the dealer who hasn't been checked the longest
        const dealerResult = await retryQuery(
            () => pool.query(
                `SELECT ec.user_id, ec.auto_relist_enabled
                 FROM ebay_connections ec
                 WHERE ec.auto_relist_enabled = true
                 ORDER BY ec.last_relist_check_at ASC NULLS FIRST
                 LIMIT 1`
            ),
            'Cron Relist - Pick dealer'
        );

        if (dealerResult.rows.length === 0) {
            return res.status(200).json({ success: true, message: 'No dealers with auto-relist enabled' });
        }

        const userId = dealerResult.rows[0].user_id;

        const accessToken = await getValidToken(pool, userId);
        if (!accessToken) {
            await pool.query('UPDATE ebay_connections SET last_relist_check_at = NOW() WHERE user_id = $1', [userId]);
            return res.status(200).json({ success: true, message: 'Dealer token expired, skipped' });
        }

        // Get ended listings
        const endedItems = await getSellerEndedListings(accessToken);

        let relisted = 0;
        let failed = 0;

        for (const ended of endedItems.slice(0, 10)) {
            // Find matching inventory item
            const invResult = await retryQuery(
                () => pool.query(
                    "SELECT id, name FROM inventory WHERE user_id = $1 AND ebay_listing_id = $2 AND ebay_auto_relist = true AND status = 'available' AND quantity > 0",
                    [userId, ended.itemId]
                ),
                'Cron Relist - Find item'
            );

            if (invResult.rows.length === 0) continue;
            const inv = invResult.rows[0];

            const result = await relistItem(accessToken, ended.itemId);

            if (result.success) {
                await pool.query(
                    "UPDATE inventory SET ebay_listing_id = $1, ebay_listing_status = 'active', ebay_listing_ended_at = NULL, updated_at = NOW() WHERE id = $2",
                    [result.newItemId, inv.id]
                );
                await pool.query(
                    'INSERT INTO ebay_relist_log (user_id, inventory_id, old_listing_id, new_listing_id, status) VALUES ($1, $2, $3, $4, $5)',
                    [userId, inv.id, ended.itemId, result.newItemId, 'success']
                );
                relisted++;
            } else {
                await pool.query(
                    'INSERT INTO ebay_relist_log (user_id, inventory_id, old_listing_id, new_listing_id, status, error_message) VALUES ($1, $2, $3, NULL, $4, $5)',
                    [userId, inv.id, ended.itemId, 'failed', result.error]
                );
                failed++;
            }
        }

        await pool.query('UPDATE ebay_connections SET last_relist_check_at = NOW() WHERE user_id = $1', [userId]);

        return res.status(200).json({
            success: true,
            dealer_id: userId,
            ended_found: endedItems.length,
            relisted,
            failed,
        });
    } catch (error) {
        console.error('eBay relist cron error:', error);
        return res.status(500).json({ error: 'Cron job failed' });
    }
};
