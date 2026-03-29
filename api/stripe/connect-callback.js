/**
 * Stripe Connect OAuth Callback
 * GET /api/stripe/connect-callback?code=xxx&state=user_id
 */

const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { getStripe } = require('../../lib/stripe');

const pool = getPool();

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const { code, state, error } = req.query;

    if (error) {
        return res.redirect('/integrations.html?stripe=error&msg=' + encodeURIComponent(error));
    }

    if (!code || !state) {
        return res.redirect('/integrations.html?stripe=error&msg=missing_params');
    }

    try {
        const stripe = getStripe();
        if (!stripe) {
            return res.redirect('/integrations.html?stripe=error&msg=stripe_not_configured');
        }

        // Exchange authorization code for connected account
        const response = await stripe.oauth.token({
            grant_type: 'authorization_code',
            code,
        });

        const connectedAccountId = response.stripe_user_id;
        const userId = parseInt(state);

        // Save the connected account ID
        await retryQuery(
            () => pool.query(
                'UPDATE users SET stripe_connect_account_id = $1, updated_at = NOW() WHERE id = $2',
                [connectedAccountId, userId]
            ),
            'Stripe Connect - Save account'
        );

        return res.redirect('/integrations.html?stripe=connected');
    } catch (err) {
        console.error('Stripe Connect callback error:', err);
        return res.redirect('/integrations.html?stripe=error&msg=' + encodeURIComponent(err.message));
    }
};
