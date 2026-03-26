/**
 * Sync Google Sheet API
 * POST /api/sheets/sync — trigger sync between DB and Google Sheet
 * Body: { direction?: 'push' | 'pull' | 'both' } — defaults to 'both'
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { pushToSheet, pullFromSheet, syncBidirectional } = require('../../lib/sheets');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { direction } = req.body || {};
        const syncDir = direction || 'both';

        // Get user's sheet connection
        const connResult = await retryQuery(
            () => pool.query(
                'SELECT * FROM sheet_connections WHERE user_id = $1 AND sync_enabled = true LIMIT 1',
                [req.user.id]
            ),
            'Sheets - Get Connection'
        );

        if (connResult.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'No sheet connected. Connect a Google Sheet first.' });
        }

        const conn = connResult.rows[0];
        let result;

        if (syncDir === 'push') {
            result = await pushToSheet(pool, req.user.id, conn.sheet_id, conn.tab_name);
            result = { direction: 'push', pushed: result.pushed };
        } else if (syncDir === 'pull') {
            result = await pullFromSheet(pool, req.user.id, conn.sheet_id, conn.tab_name);
            result = { direction: 'pull', ...result };
        } else {
            result = await syncBidirectional(pool, req.user.id, conn.sheet_id, conn.tab_name);
            result = { direction: 'both', ...result };
        }

        // Update sync status
        await pool.query(
            'UPDATE sheet_connections SET last_synced_at = NOW(), last_sync_status = $1, last_sync_message = $2, updated_at = NOW() WHERE id = $3',
            ['success', JSON.stringify(result), conn.id]
        );

        return res.status(200).json({ success: true, sync: result });
    } catch (error) {
        console.error('Sheet sync error:', error);

        // Update sync status with error
        try {
            await pool.query(
                "UPDATE sheet_connections SET last_sync_status = 'error', last_sync_message = $1, updated_at = NOW() WHERE user_id = $2",
                [error.message, req.user.id]
            );
        } catch (e) { /* ignore */ }

        return res.status(500).json({ success: false, error: 'Sync failed: ' + error.message });
    }
});
