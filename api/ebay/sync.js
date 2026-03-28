/**
 * eBay Inventory Sync
 * POST /api/ebay/sync — push inventory to eBay
 * Body: { action: 'push' | 'push_item', item_id?: number }
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { getValidToken, createOrUpdateInventoryItem, createOffer, publishOffer } = require('../../lib/ebay');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const accessToken = await getValidToken(pool, req.user.id);
        if (!accessToken) {
            return res.status(400).json({ success: false, error: 'eBay not connected or token expired. Please reconnect.' });
        }

        const { action, item_id } = req.body;

        if (action === 'push_item' && item_id) {
            // Push single item
            const result = await pool.query('SELECT * FROM inventory WHERE id = $1', [item_id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Item not found' });
            }

            const item = result.rows[0];
            const sku = `CS-${item.id}`;

            if (!item.ebay_listing_id && item.sell_price) {
                const offer = await createOffer(accessToken, sku, item.sell_price, item);

                let listingId = offer.listingId || null;
                let offerId = offer.offerId || null;

                // If Inventory API offer, need to publish
                if (offerId && !listingId) {
                    const published = await publishOffer(accessToken, offerId);
                    listingId = published.listingId;
                }

                await pool.query(
                    'UPDATE inventory SET ebay_sku = $1, ebay_offer_id = $2, ebay_listing_id = $3 WHERE id = $4',
                    [sku, offerId, listingId, item.id]
                );
            }

            return res.status(200).json({ success: true, message: 'Item pushed to eBay', sku });
        }

        if (action === 'push') {
            // Push all available inventory
            const items = await pool.query(
                "SELECT * FROM inventory WHERE status = 'available' AND quantity > 0 AND sell_price IS NOT NULL ORDER BY id LIMIT 25"
            );

            let pushed = 0;
            let errors = [];

            for (const item of items.rows) {
                try {
                    const sku = `CS-${item.id}`;

                    if (!item.ebay_listing_id) {
                        const offer = await createOffer(accessToken, sku, item.sell_price, item);

                        let listingId = offer.listingId || null;
                        let offerId = offer.offerId || null;

                        if (offerId && !listingId) {
                            const published = await publishOffer(accessToken, offerId);
                            listingId = published.listingId;
                        }

                        await pool.query(
                            'UPDATE inventory SET ebay_sku = $1, ebay_offer_id = $2, ebay_listing_id = $3 WHERE id = $4',
                            [sku, offerId, listingId, item.id]
                        );
                    }

                    pushed++;
                } catch (err) {
                    errors.push({ item_id: item.id, name: item.name, error: err.message });
                }
            }

            // Update sync status
            await pool.query(
                "UPDATE ebay_connections SET last_synced_at = NOW(), last_sync_status = $1, last_sync_message = $2, updated_at = NOW() WHERE user_id = $3",
                [errors.length === 0 ? 'success' : 'partial', `Pushed ${pushed}/${items.rows.length} items`, req.user.id]
            );

            return res.status(200).json({
                success: true,
                pushed,
                total: items.rows.length,
                errors: errors.slice(0, 5),
            });
        }

        return res.status(400).json({ success: false, error: 'Invalid action. Use: push, push_item' });
    } catch (error) {
        console.error('eBay sync error:', error);
        return res.status(500).json({ success: false, error: 'eBay sync failed: ' + error.message });
    }
});
