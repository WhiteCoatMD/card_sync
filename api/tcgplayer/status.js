/**
 * TCGplayer Status API
 * GET    /api/tcgplayer/status — check connection status
 * DELETE /api/tcgplayer/status — disconnect
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
        const result = await retryQuery(
            () => pool.query('SELECT * FROM tcgplayer_connections WHERE user_id = $1', [req.user.id]),
            'TCGplayer - Status'
        );

        if (result.rows.length === 0) {
            return res.status(200).json({ success: true, connected: false });
        }

        const conn = result.rows[0];
        return res.status(200).json({
            success: true,
            connected: true,
            connection: {
                store_name: conn.store_name,
                last_synced_at: conn.last_synced_at,
                last_sync_status: conn.last_sync_status,
                last_sync_message: conn.last_sync_message,
            },
        });
    }

    if (req.method === 'DELETE') {
        await retryQuery(
            () => pool.query('DELETE FROM tcgplayer_connections WHERE user_id = $1', [req.user.id]),
            'TCGplayer - Disconnect'
        );

        // Clear TCGplayer IDs from inventory
        await retryQuery(
            () => pool.query(
                'UPDATE inventory SET tcgplayer_product_id = NULL, tcgplayer_sku = NULL, tcgplayer_listing_id = NULL WHERE user_id = $1',
                [req.user.id]
            ),
            'TCGplayer - Clear inventory'
        );

        return res.status(200).json({ success: true, message: 'TCGplayer disconnected' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
