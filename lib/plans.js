/**
 * Subscription Plan Definitions & Enforcement
 */

const PLANS = {
    free: {
        name: 'Free',
        price: 0,
        card_limit: 250,
        platform_fee_percent: 5.0,
        features: ['inventory_management', 'marketplace', 'pricing_lookup'],
        sheets_sync: false,
        ebay_sync: false,
        multi_user: false,
        analytics: false,
        bulk_import: false,
        buylist: true,
        priority_support: false,
    },
    pro: {
        name: 'Pro',
        price: 29,
        card_limit: 5000,
        platform_fee_percent: 1.5,
        features: ['inventory_management', 'marketplace', 'pricing_lookup', 'sheets_sync', 'bulk_import', 'buylist', 'analytics'],
        sheets_sync: true,
        ebay_sync: false,
        multi_user: false,
        analytics: true,
        bulk_import: true,
        buylist: true,
        priority_support: false,
    },
    business: {
        name: 'Business',
        price: 59,
        card_limit: 25000,
        platform_fee_percent: 1.5,
        features: ['inventory_management', 'marketplace', 'pricing_lookup', 'sheets_sync', 'ebay_sync', 'bulk_import', 'buylist', 'analytics', 'multi_user'],
        sheets_sync: true,
        ebay_sync: true,
        multi_user: true,
        analytics: true,
        bulk_import: true,
        buylist: true,
        priority_support: false,
    },
    shop: {
        name: 'Shop',
        price: 99,
        card_limit: -1, // unlimited
        platform_fee_percent: 1.5,
        features: ['inventory_management', 'marketplace', 'pricing_lookup', 'sheets_sync', 'ebay_sync', 'bulk_import', 'buylist', 'analytics', 'multi_user', 'api_access', 'priority_support'],
        sheets_sync: true,
        ebay_sync: true,
        multi_user: true,
        analytics: true,
        bulk_import: true,
        buylist: true,
        priority_support: true,
    },
};

function getPlan(planId) {
    return PLANS[planId] || PLANS.free;
}

function getPlanLimit(planId) {
    const plan = getPlan(planId);
    return plan.card_limit;
}

function hasFeature(planId, feature) {
    const plan = getPlan(planId);
    return plan[feature] === true || (plan.features && plan.features.includes(feature));
}

/**
 * Check if user can add more cards to inventory
 */
async function checkCardLimit(pool, userId, planId) {
    const limit = getPlanLimit(planId || 'free');
    if (limit === -1) return { allowed: true, current: 0, limit: -1 };

    const result = await pool.query(
        'SELECT COUNT(*) as count FROM inventory WHERE user_id = $1 OR user_id IS NULL',
        [userId]
    );
    const current = parseInt(result.rows[0].count);

    return {
        allowed: current < limit,
        current,
        limit,
        remaining: Math.max(0, limit - current),
    };
}

/**
 * Middleware: require a specific feature/plan level
 */
function requireFeature(feature) {
    return (req, res, next) => {
        const userPlan = req.user?.plan || 'free';
        if (!hasFeature(userPlan, feature)) {
            const plan = getPlan(userPlan);
            return res.status(403).json({
                success: false,
                error: `This feature requires a higher plan. You're on ${plan.name}. Upgrade to access this feature.`,
                upgrade_required: true,
                current_plan: userPlan,
            });
        }
        if (typeof next === 'function') next();
        return true;
    };
}

function getPlatformFeePercent(planId) {
    const plan = getPlan(planId);
    return plan.platform_fee_percent || 5.0;
}

module.exports = {
    PLANS,
    getPlan,
    getPlanLimit,
    hasFeature,
    checkCardLimit,
    requireFeature,
    getPlatformFeePercent,
};
