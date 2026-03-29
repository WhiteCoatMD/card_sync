/**
 * Stripe Connect integration
 * Platform uses STRIPE_SECRET_KEY env var
 * Dealers connect via Stripe Connect OAuth and get a stripe_connect_account_id
 */

const Stripe = require('stripe');
const { getPool } = require('./db');
const { retryQuery } = require('./db-retry');

const pool = getPool();

/**
 * Get the platform Stripe instance
 */
function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return null;
    return new Stripe(key);
}

/**
 * Get a dealer's Stripe Connect account ID
 */
async function getDealerStripeAccount(dealerId) {
    const result = await retryQuery(
        () => pool.query('SELECT stripe_connect_account_id, plan FROM users WHERE id = $1', [dealerId]),
        'Stripe - Get dealer account'
    );

    if (result.rows.length === 0 || !result.rows[0].stripe_connect_account_id) {
        return null;
    }

    return {
        accountId: result.rows[0].stripe_connect_account_id,
        plan: result.rows[0].plan || 'free',
    };
}

/**
 * Generate Stripe Connect OAuth URL for dealer onboarding
 */
function getConnectUrl(state) {
    const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
    if (!clientId) return null;

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: 'read_write',
        redirect_uri: 'https://collect-sync.com/api/stripe/connect-callback',
        state: state || '',
    });

    return `https://connect.stripe.com/oauth/authorize?${params}`;
}

module.exports = { getStripe, getDealerStripeAccount, getConnectUrl };
