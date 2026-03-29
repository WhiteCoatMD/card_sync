/**
 * Shop Stripe Connect Status API
 * GET  /api/shop/stripe — check if Stripe Connect is linked
 * DELETE /api/shop/stripe — disconnect Stripe account
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
            () => pool.query('SELECT stripe_connect_account_id, plan FROM users WHERE id = $1', [req.user.id]),
            'Stripe Status - Get'
        );
        const row = result.rows[0];
        const connected = !!(row && row.stripe_connect_account_id);

        const { getPlatformFeePercent } = require('../../lib/plans');
        const feePercent = getPlatformFeePercent(row?.plan || 'free');

        return res.status(200).json({
            success: true,
            connected,
            account_id: connected ? row.stripe_connect_account_id : null,
            platform_fee_percent: feePercent,
        });
    }

    if (req.method === 'DELETE') {
        await retryQuery(
            () => pool.query(
                'UPDATE users SET stripe_connect_account_id = NULL, updated_at = NOW() WHERE id = $1',
                [req.user.id]
            ),
            'Stripe Status - Disconnect'
        );
        return res.status(200).json({ success: true, message: 'Stripe disconnected' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
