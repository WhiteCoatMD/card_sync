/**
 * eBay Connection Status
 * GET    /api/ebay/status — check connection
 * DELETE /api/ebay/status — disconnect
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
            'SELECT id, ebay_username, sync_enabled, last_synced_at, last_sync_status, last_sync_message, created_at FROM ebay_connections WHERE user_id = $1',
            [req.user.id]
        );

        return res.status(200).json({
            success: true,
            connected: result.rows.length > 0,
            connection: result.rows[0] || null,
        });
    }

    if (req.method === 'DELETE') {
        await pool.query('DELETE FROM ebay_connections WHERE user_id = $1', [req.user.id]);
        return res.status(200).json({ success: true, message: 'eBay disconnected' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
