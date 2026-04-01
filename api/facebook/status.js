/**
 * Facebook Connection Status
 * GET    /api/facebook/status — check connection
 * DELETE /api/facebook/status — disconnect
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        const result = await pool.query(
            `SELECT id, page_id, page_name, token_expires_at, post_schedule, schedule_time,
                    auto_post_new, auto_post_price_drop, last_posted_at, last_post_status, last_post_message, created_at
             FROM facebook_connections WHERE user_id = $1`,
            [req.user.id]
        );

        return res.status(200).json({
            success: true,
            connected: result.rows.length > 0,
            connection: result.rows[0] || null,
        });
    }

    if (req.method === 'DELETE') {
        await pool.query('DELETE FROM facebook_connections WHERE user_id = $1', [req.user.id]);
        return res.status(200).json({ success: true, message: 'Facebook disconnected' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
