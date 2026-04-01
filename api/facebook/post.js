/**
 * Facebook Post
 * POST /api/facebook/post — post card listings to Facebook Page
 * Body: { action: 'post_item' | 'post_batch' | 'marketplace_assist', item_id?, item_ids? }
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { getValidToken, postCardToPage, formatMarketplaceAssist } = require('../../lib/facebook');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const userId = req.user.id;
        const { action, item_id, item_ids } = req.body;

        if (!action) {
            return res.status(400).json({ success: false, error: 'action is required' });
        }

        // Get the user's shop subdomain for store links
        const subResult = await pool.query(
            'SELECT subdomain FROM users WHERE id = $1',
            [userId]
        );
        const subdomain = subResult.rows.length > 0 ? subResult.rows[0].subdomain : null;

        // Handle marketplace_assist — no token needed
        if (action === 'marketplace_assist') {
            if (!item_id) {
                return res.status(400).json({ success: false, error: 'item_id is required for marketplace_assist' });
            }

            const itemResult = await pool.query(
                'SELECT * FROM inventory WHERE id = $1 AND user_id = $2',
                [item_id, userId]
            );

            if (itemResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Item not found' });
            }

            const data = formatMarketplaceAssist(itemResult.rows[0]);
            return res.status(200).json({ success: true, marketplace: data });
        }

        // For posting actions, we need a valid token
        const tokenData = await getValidToken(pool, userId);
        if (!tokenData) {
            return res.status(400).json({ success: false, error: 'Facebook not connected or token expired. Please reconnect.' });
        }

        if (!tokenData.pageId) {
            return res.status(400).json({ success: false, error: 'No Facebook Page selected. Please select a page first.' });
        }

        if (action === 'post_item') {
            if (!item_id) {
                return res.status(400).json({ success: false, error: 'item_id is required for post_item' });
            }

            const itemResult = await pool.query(
                'SELECT * FROM inventory WHERE id = $1 AND user_id = $2',
                [item_id, userId]
            );

            if (itemResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Item not found' });
            }

            const card = itemResult.rows[0];
            const fbResult = await postCardToPage(tokenData.pageToken, tokenData.pageId, card, subdomain);

            // Record the post
            await pool.query(
                `INSERT INTO facebook_posts (user_id, inventory_id, page_id, facebook_post_id, post_type)
                 VALUES ($1, $2, $3, $4, 'page_post')`,
                [userId, item_id, tokenData.pageId, fbResult.id || fbResult.post_id || null]
            );

            return res.status(200).json({ success: true, message: 'Posted to Facebook', post: fbResult });
        }

        if (action === 'post_batch') {
            let items;

            if (item_ids && item_ids.length > 0) {
                // Post specific items
                const ids = item_ids.slice(0, 10);
                const itemResult = await pool.query(
                    `SELECT * FROM inventory WHERE id = ANY($1) AND user_id = $2`,
                    [ids, userId]
                );
                items = itemResult.rows;
            } else {
                // Post next unposted items (up to 10)
                const itemResult = await pool.query(
                    `SELECT i.* FROM inventory i
                     LEFT JOIN facebook_posts fp ON fp.inventory_id = i.id AND fp.user_id = i.user_id
                     WHERE i.user_id = $1 AND fp.id IS NULL AND i.quantity > 0
                     ORDER BY i.created_at DESC
                     LIMIT 10`,
                    [userId]
                );
                items = itemResult.rows;
            }

            if (items.length === 0) {
                return res.status(200).json({ success: true, message: 'No items to post', posted: 0 });
            }

            const results = [];
            let posted = 0;
            let errors = 0;

            for (const card of items) {
                try {
                    const fbResult = await postCardToPage(tokenData.pageToken, tokenData.pageId, card, subdomain);

                    await pool.query(
                        `INSERT INTO facebook_posts (user_id, inventory_id, page_id, facebook_post_id, post_type)
                         VALUES ($1, $2, $3, $4, 'page_post')`,
                        [userId, card.id, tokenData.pageId, fbResult.id || fbResult.post_id || null]
                    );

                    results.push({ item_id: card.id, success: true });
                    posted++;
                } catch (err) {
                    console.error(`Facebook post error for item ${card.id}:`, err.message);
                    results.push({ item_id: card.id, success: false, error: err.message });
                    errors++;
                }
            }

            return res.status(200).json({ success: true, message: `Posted ${posted} items`, posted, errors, results });
        }

        return res.status(400).json({ success: false, error: 'Invalid action. Use post_item, post_batch, or marketplace_assist.' });
    } catch (error) {
        console.error('Facebook post error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
