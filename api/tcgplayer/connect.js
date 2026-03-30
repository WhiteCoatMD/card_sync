/**
 * TCGplayer Connect API
 * POST /api/tcgplayer/connect — save dealer's TCGplayer seller credentials
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { store_name } = req.body;

        if (!store_name) {
            return res.status(400).json({ success: false, error: 'TCGplayer store name is required' });
        }

        // Upsert connection
        await retryQuery(
            () => pool.query(
                `INSERT INTO tcgplayer_connections (user_id, store_name)
                 VALUES ($1, $2)
                 ON CONFLICT (user_id) DO UPDATE SET store_name = $2, updated_at = NOW()`,
                [req.user.id, store_name]
            ),
            'TCGplayer - Connect'
        );

        return res.status(200).json({ success: true, message: 'TCGplayer connected' });
    } catch (error) {
        console.error('TCGplayer connect error:', error);
        return res.status(500).json({ success: false, error: 'Failed to connect TCGplayer' });
    }
});
