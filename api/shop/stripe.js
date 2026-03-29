/**
 * Shop Stripe Settings API
 * GET  /api/shop/stripe — check if Stripe is configured
 * PUT  /api/shop/stripe — save Stripe secret key
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
            () => pool.query('SELECT stripe_secret_key FROM users WHERE id = $1', [req.user.id]),
            'Stripe Settings - Get'
        );
        const hasKey = !!(result.rows[0] && result.rows[0].stripe_secret_key);
        return res.status(200).json({ success: true, configured: hasKey });
    }

    if (req.method === 'PUT') {
        const { stripe_secret_key } = req.body;

        if (stripe_secret_key && !stripe_secret_key.startsWith('sk_')) {
            return res.status(400).json({ success: false, error: 'Invalid Stripe key. It should start with sk_test_ or sk_live_' });
        }

        await retryQuery(
            () => pool.query(
                'UPDATE users SET stripe_secret_key = $1, updated_at = NOW() WHERE id = $2',
                [stripe_secret_key || null, req.user.id]
            ),
            'Stripe Settings - Update'
        );

        return res.status(200).json({ success: true, message: stripe_secret_key ? 'Stripe connected' : 'Stripe disconnected' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
