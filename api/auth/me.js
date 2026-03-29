/**
 * Current User API — returns user info + plan + features
 * GET /api/auth/me
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPlan } = require('../../lib/plans');

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const plan = getPlan(req.user.plan || 'free');

    return res.status(200).json({
        success: true,
        user: {
            id: req.user.id,
            email: req.user.email,
            displayName: req.user.displayName,
            is_admin: req.user.is_admin,
            plan: req.user.plan || 'free',
            plan_name: plan.name,
            features: plan.features,
            role: req.user.role,
        },
    });
});
