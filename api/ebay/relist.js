/**
 * eBay Relist API — Manual relist trigger
 * POST /api/ebay/relist — check for ended listings and relist them
 * GET  /api/ebay/relist — get relist log
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { getValidToken, getSellerEndedListings, relistItem } = require('../../lib/ebay');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        // Return relist log
        const result = await retryQuery(
            () => pool.query(
                `SELECT r.*, i.name as card_name FROM ebay_relist_log r
                 LEFT JOIN inventory i ON r.inventory_id = i.id
                 WHERE r.user_id = $1
                 ORDER BY r.created_at DESC LIMIT 50`,
                [req.user.id]
            ),
            'Relist - Log'
        );
        return res.status(200).json({ success: true, log: result.rows });
    }

    if (req.method === 'POST') {
        try {
            const accessToken = await getValidToken(pool, req.user.id);
            if (!accessToken) {
                return res.status(400).json({ success: false, error: 'eBay not connected or token expired. Reconnect eBay.' });
            }

            // Get ended listings from eBay
            const endedItems = await getSellerEndedListings(accessToken);

            if (endedItems.length === 0) {
                return res.status(200).json({ success: true, message: 'No ended listings to relist', relisted: 0 });
            }

            // Match ended listings to inventory items
            const results = { relisted: 0, failed: 0, errors: [] };
            const maxRelist = 10; // Limit per run to avoid timeout
            let processed = 0;

            for (const ended of endedItems) {
                if (processed >= maxRelist) break;

                // Find inventory item with this eBay listing ID
                const invResult = await retryQuery(
                    () => pool.query(
                        "SELECT id, name, ebay_auto_relist FROM inventory WHERE user_id = $1 AND ebay_listing_id = $2 AND status = 'available' AND quantity > 0",
                        [req.user.id, ended.itemId]
                    ),
                    'Relist - Find item'
                );

                if (invResult.rows.length === 0) continue;
                const inv = invResult.rows[0];

                // Skip if auto-relist is disabled for this item
                if (inv.ebay_auto_relist === false) continue;

                processed++;

                // Relist the item
                const result = await relistItem(accessToken, ended.itemId);

                if (result.success) {
                    // Update inventory with new listing ID
                    await retryQuery(
                        () => pool.query(
                            "UPDATE inventory SET ebay_listing_id = $1, ebay_listing_status = 'active', ebay_listing_ended_at = NULL, updated_at = NOW() WHERE id = $2",
                            [result.newItemId, inv.id]
                        ),
                        'Relist - Update inventory'
                    );

                    // Log success
                    await pool.query(
                        'INSERT INTO ebay_relist_log (user_id, inventory_id, old_listing_id, new_listing_id, status) VALUES ($1, $2, $3, $4, $5)',
                        [req.user.id, inv.id, ended.itemId, result.newItemId, 'success']
                    );

                    results.relisted++;
                } else {
                    // Log failure
                    await pool.query(
                        'INSERT INTO ebay_relist_log (user_id, inventory_id, old_listing_id, new_listing_id, status, error_message) VALUES ($1, $2, $3, NULL, $4, $5)',
                        [req.user.id, inv.id, ended.itemId, 'failed', result.error]
                    );

                    results.failed++;
                    results.errors.push({ item: inv.name, error: result.error });
                }
            }

            // Update last relist check timestamp
            await pool.query(
                'UPDATE ebay_connections SET last_relist_check_at = NOW() WHERE user_id = $1',
                [req.user.id]
            );

            return res.status(200).json({
                success: true,
                message: `Relisted ${results.relisted} items` + (results.failed ? `, ${results.failed} failed` : ''),
                ...results,
                ended_found: endedItems.length,
            });
        } catch (error) {
            console.error('Relist error:', error);
            return res.status(500).json({ success: false, error: 'Relist failed: ' + error.message });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
