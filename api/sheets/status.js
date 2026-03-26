/**
 * Sheet Connection Status API
 * GET    /api/sheets/status — get current sheet connection info
 * DELETE /api/sheets/status — disconnect sheet
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        try {
            const result = await retryQuery(
                () => pool.query(
                    'SELECT * FROM sheet_connections WHERE user_id = $1 ORDER BY created_at DESC',
                    [req.user.id]
                ),
                'Sheets - Status'
            );

            return res.status(200).json({
                success: true,
                connected: result.rows.length > 0,
                connections: result.rows,
            });
        } catch (error) {
            console.error('Sheet status error:', error);
            return res.status(500).json({ success: false, error: 'Failed to get sheet status' });
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { sheet_id } = req.query || {};
            if (sheet_id) {
                await pool.query('DELETE FROM sheet_connections WHERE user_id = $1 AND sheet_id = $2', [req.user.id, sheet_id]);
            } else {
                await pool.query('DELETE FROM sheet_connections WHERE user_id = $1', [req.user.id]);
            }
            return res.status(200).json({ success: true, message: 'Sheet disconnected' });
        } catch (error) {
            console.error('Sheet disconnect error:', error);
            return res.status(500).json({ success: false, error: 'Failed to disconnect sheet' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
