/**
 * Stripe Connect — Create connected account + onboarding link
 * GET /api/stripe/connect — creates a Connect account and returns onboarding URL
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { getStripe } = require('../../lib/stripe');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const stripe = getStripe();
    if (!stripe) {
        return res.status(500).json({ success: false, error: 'Stripe is not configured' });
    }

    try {
        // Check if dealer already has a connected account
        const existing = await retryQuery(
            () => pool.query('SELECT stripe_connect_account_id FROM users WHERE id = $1', [req.user.id]),
            'Stripe Connect - Check existing'
        );

        let accountId = existing.rows[0]?.stripe_connect_account_id;

        if (!accountId) {
            // Create a new connected account
            const account = await stripe.accounts.create({
                type: 'express',
                email: req.user.email,
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
                business_type: 'individual',
            });

            accountId = account.id;

            // Save to DB
            await retryQuery(
                () => pool.query(
                    'UPDATE users SET stripe_connect_account_id = $1, updated_at = NOW() WHERE id = $2',
                    [accountId, req.user.id]
                ),
                'Stripe Connect - Save account'
            );
        }

        // Create an account onboarding link
        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            refresh_url: 'https://collect-sync.com/integrations.html?stripe=refresh',
            return_url: 'https://collect-sync.com/integrations.html?stripe=connected',
            type: 'account_onboarding',
        });

        return res.status(200).json({
            success: true,
            redirect_url: accountLink.url,
        });
    } catch (error) {
        console.error('Stripe Connect error:', error);
        return res.status(500).json({ success: false, error: 'Failed to start Stripe onboarding' });
    }
});
