/**
 * Stripe Connect integration
 * Platform uses STRIPE_SECRET_KEY env var
 * Dealers onboard via Stripe Express accounts (Account Links)
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
 * Get a dealer's Stripe Connect account ID and plan
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

module.exports = { getStripe, getDealerStripeAccount };
