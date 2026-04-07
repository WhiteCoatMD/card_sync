/**
 * Facebook scheduled posts cron job
 * Finds dealers with active post schedules and posts their next batch
 *
 * Secured via CRON_SECRET header check
 * GET /api/cron/facebook-posts
 */

const { getPool } = require('../../lib/db');
const { getValidToken, postCardToPage } = require('../../lib/facebook');

const pool = getPool();

const BATCH_SIZES = {
    daily_5: 5,
    daily_10: 10,
    twice_daily_5: 5,
};

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    // Verify cron secret
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && (!authHeader || authHeader !== `Bearer ${cronSecret}`)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Get all dealers with an active Facebook post schedule and a valid page selected
        const connections = await pool.query(
            `SELECT fc.user_id, fc.post_schedule, u.subdomain
             FROM facebook_connections fc
             JOIN users u ON u.id = fc.user_id
             WHERE fc.post_schedule IS NOT NULL
               AND fc.page_id IS NOT NULL
               AND fc.token_expires_at > NOW()`
        );

        let totalPosted = 0;
        let dealersProcessed = 0;

        for (const conn of connections.rows) {
            const batchSize = BATCH_SIZES[conn.post_schedule];
            if (!batchSize) continue;

            const tokenData = await getValidToken(pool, conn.user_id);
            if (!tokenData || !tokenData.pageId) continue;

            // Get unposted available items
            const items = await pool.query(
                `SELECT i.* FROM inventory i
                 LEFT JOIN facebook_posts fp ON fp.inventory_id = i.id AND fp.user_id = i.user_id
                 WHERE i.user_id = $1 AND fp.id IS NULL AND i.quantity > 0 AND i.status = 'available'
                 ORDER BY i.created_at DESC
                 LIMIT $2`,
                [conn.user_id, batchSize]
            );

            if (items.rows.length === 0) continue;

            let posted = 0;
            for (const card of items.rows) {
                try {
                    const fbResult = await postCardToPage(tokenData.pageToken, tokenData.pageId, card, conn.subdomain);

                    await pool.query(
                        `INSERT INTO facebook_posts (user_id, inventory_id, page_id, facebook_post_id, post_type)
                         VALUES ($1, $2, $3, $4, 'scheduled')`,
                        [conn.user_id, card.id, tokenData.pageId, fbResult.id || fbResult.post_id || null]
                    );
                    posted++;
                } catch (err) {
                    console.error(`Cron FB post error for user ${conn.user_id}, item ${card.id}:`, err.message);
                }
            }

            if (posted > 0) {
                await pool.query(
                    `UPDATE facebook_connections SET last_post_at = NOW(), last_post_status = 'success',
                     last_post_message = $1, updated_at = NOW() WHERE user_id = $2`,
                    [`Scheduled: posted ${posted} cards`, conn.user_id]
                );
            }

            totalPosted += posted;
            dealersProcessed++;
        }

        return res.status(200).json({
            success: true,
            dealers_processed: dealersProcessed,
            total_posted: totalPosted,
        });
    } catch (error) {
        console.error('Facebook posts cron error:', error);
        return res.status(500).json({ error: 'Cron job failed' });
    }
};
