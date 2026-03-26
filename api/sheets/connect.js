/**
 * Connect Google Sheet API
 * POST /api/sheets/connect — link a Google Sheet to this dealer's account
 * Body: { sheet_id, sheet_name?, tab_name? }
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { ensureHeaders } = require('../../lib/sheets');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { sheet_id, sheet_name, tab_name } = req.body;

        if (!sheet_id) {
            return res.status(400).json({ success: false, error: 'sheet_id is required (from the Google Sheet URL)' });
        }

        const tabName = tab_name || 'Sheet1';

        // Verify we can access the sheet
        try {
            await ensureHeaders(sheet_id, tabName);
        } catch (err) {
            const msg = err.message || '';
            if (msg.includes('not found') || msg.includes('404')) {
                return res.status(400).json({ success: false, error: 'Sheet not found. Make sure you shared it with card-sync-sheets@card-sync-491400.iam.gserviceaccount.com' });
            }
            if (msg.includes('403') || msg.includes('permission')) {
                return res.status(400).json({ success: false, error: 'No permission. Share the sheet with card-sync-sheets@card-sync-491400.iam.gserviceaccount.com as Editor.' });
            }
            return res.status(400).json({ success: false, error: 'Cannot access sheet: ' + msg });
        }

        // Upsert connection
        const result = await retryQuery(
            () => pool.query(
                `INSERT INTO sheet_connections (user_id, sheet_id, sheet_name, tab_name, sync_enabled)
                 VALUES ($1, $2, $3, $4, true)
                 ON CONFLICT (user_id, sheet_id)
                 DO UPDATE SET sheet_name = $3, tab_name = $4, sync_enabled = true, updated_at = NOW()
                 RETURNING *`,
                [req.user.id, sheet_id, sheet_name || 'My Inventory', tabName]
            ),
            'Sheets - Connect'
        );

        return res.status(200).json({ success: true, connection: result.rows[0] });
    } catch (error) {
        console.error('Sheet connect error:', error);
        return res.status(500).json({ success: false, error: 'Failed to connect sheet' });
    }
});
