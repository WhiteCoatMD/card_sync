/**
 * Return Address API
 * GET  /api/shipping/address — get return address
 * PUT  /api/shipping/address — save return address
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
            () => pool.query(
                'SELECT ship_from_name, ship_from_street1, ship_from_city, ship_from_state, ship_from_zip FROM users WHERE id = $1',
                [req.user.id]
            ),
            'Address - Get'
        );
        return res.status(200).json({ success: true, address: result.rows[0] || {} });
    }

    if (req.method === 'PUT') {
        const { name, street1, city, state, zip } = req.body;
        await retryQuery(
            () => pool.query(
                'UPDATE users SET ship_from_name = $1, ship_from_street1 = $2, ship_from_city = $3, ship_from_state = $4, ship_from_zip = $5, updated_at = NOW() WHERE id = $6',
                [name || null, street1 || null, city || null, state || null, zip || null, req.user.id]
            ),
            'Address - Update'
        );
        return res.status(200).json({ success: true, message: 'Return address saved' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
