/**
 * Stripe integration helpers
 * Each dealer has their own Stripe secret key stored in the DB
 */

const Stripe = require('stripe');
const { getPool } = require('./db');
const { retryQuery } = require('./db-retry');

const pool = getPool();

/**
 * Get an initialized Stripe instance for a dealer
 */
async function getStripeForDealer(dealerId) {
    const result = await retryQuery(
        () => pool.query('SELECT stripe_secret_key FROM users WHERE id = $1', [dealerId]),
        'Stripe - Get key'
    );

    if (result.rows.length === 0 || !result.rows[0].stripe_secret_key) {
        return null;
    }

    return new Stripe(result.rows[0].stripe_secret_key);
}

module.exports = { getStripeForDealer };
