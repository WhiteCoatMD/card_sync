/**
 * Subscription API
 * GET  /api/subscription — get current plan info
 * POST /api/subscription — upgrade/change plan
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { PLANS, getPlan, checkCardLimit } = require('../../lib/plans');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        try {
            const plan = getPlan(req.user.plan);
            const limitCheck = await checkCardLimit(pool, req.user.id, req.user.plan);

            return res.status(200).json({
                success: true,
                plan: {
                    id: req.user.plan || 'free',
                    name: plan.name,
                    price: plan.price,
                    card_limit: plan.card_limit,
                    cards_used: limitCheck.current,
                    cards_remaining: limitCheck.remaining,
                    features: plan.features,
                    sheets_sync: plan.sheets_sync,
                    ebay_sync: plan.ebay_sync,
                    multi_user: plan.multi_user,
                    analytics: plan.analytics,
                    bulk_import: plan.bulk_import,
                    buylist: plan.buylist,
                },
                all_plans: Object.entries(PLANS).map(([id, p]) => ({
                    id,
                    name: p.name,
                    price: p.price,
                    card_limit: p.card_limit,
                    features: p.features,
                })),
            });
        } catch (error) {
            console.error('Subscription get error:', error);
            return res.status(500).json({ success: false, error: 'Failed to get plan info' });
        }
    }

    if (req.method === 'POST') {
        try {
            const { plan_id } = req.body;

            if (!plan_id || !PLANS[plan_id]) {
                return res.status(400).json({ success: false, error: 'Invalid plan. Choose: free, pro, business, or shop.' });
            }

            // Only owner can change plan
            if (req.user.role !== 'owner' && !req.user.is_admin) {
                return res.status(403).json({ success: false, error: 'Only the account owner can change the plan.' });
            }

            const plan = PLANS[plan_id];

            // TODO: Integrate PayPal/Stripe payment before activating paid plans
            // For now, allow plan changes (payment integration coming)

            await retryQuery(
                () => pool.query(
                    'UPDATE users SET plan = $1, plan_card_limit = $2, subscription_status = $3, updated_at = NOW() WHERE id = $4',
                    [plan_id, plan.card_limit, plan_id === 'free' ? 'free' : 'active', req.user.id]
                ),
                'Subscription - Update Plan'
            );

            return res.status(200).json({
                success: true,
                message: `Plan updated to ${plan.name}`,
                plan: {
                    id: plan_id,
                    name: plan.name,
                    price: plan.price,
                    card_limit: plan.card_limit,
                },
            });
        } catch (error) {
            console.error('Subscription update error:', error);
            return res.status(500).json({ success: false, error: 'Failed to update plan' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
