/**
 * Super Admin API — Platform management
 * GET  /api/super-admin — dashboard stats + all dealers
 * PUT  /api/super-admin — update a dealer (plan, status, admin flag)
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');

const pool = getPool();

function requireSuperAdmin(handler) {
    return requireAuth(async (req, res) => {
        if (!req.user.is_admin) {
            return res.status(403).json({ success: false, error: 'Super admin access required' });
        }
        return handler(req, res);
    });
}

module.exports = requireSuperAdmin(async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        // Platform stats
        const stats = await retryQuery(
            () => pool.query(`
                SELECT
                    (SELECT COUNT(*) FROM users WHERE role = 'owner') as total_dealers,
                    (SELECT COUNT(*) FROM users WHERE subscription_status = 'active') as active_subscriptions,
                    (SELECT COUNT(*) FROM users WHERE subscription_status = 'trial') as trial_users,
                    (SELECT COUNT(*) FROM inventory) as total_cards,
                    (SELECT COUNT(*) FROM inventory WHERE status = 'available') as available_cards,
                    (SELECT COUNT(*) FROM orders) as total_orders,
                    (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status = 'completed') as total_revenue,
                    (SELECT COUNT(*) FROM ebay_connections) as ebay_connections,
                    (SELECT COUNT(*) FROM sheet_connections) as sheet_connections,
                    (SELECT COUNT(*) FROM users WHERE shop_enabled = true) as active_stores
            `),
            'SuperAdmin - Stats'
        );

        // All dealers with their card counts
        const dealers = await retryQuery(
            () => pool.query(`
                SELECT
                    u.id, u.email, u.display_name, u.is_admin,
                    u.subscription_status, u.subscription_plan, u.plan, u.plan_card_limit,
                    u.plan_expires_at, u.trial_ends_at,
                    u.subdomain, u.shop_name, u.shop_enabled,
                    u.role, u.created_at, u.last_login_at,
                    COUNT(DISTINCT i.id) as card_count,
                    COUNT(DISTINCT CASE WHEN i.status = 'available' THEN i.id END) as available_count,
                    COALESCE(SUM(CASE WHEN i.status = 'available' THEN i.sell_price * i.quantity END), 0) as inventory_value,
                    (SELECT COUNT(*) FROM ebay_connections ec WHERE ec.user_id = u.id) as has_ebay,
                    (SELECT COUNT(*) FROM sheet_connections sc WHERE sc.user_id = u.id) as has_sheets
                FROM users u
                LEFT JOIN inventory i ON i.user_id = u.id
                WHERE u.role = 'owner' OR u.is_admin = true
                GROUP BY u.id
                ORDER BY u.created_at DESC
            `),
            'SuperAdmin - Dealers'
        );

        return res.status(200).json({
            success: true,
            stats: stats.rows[0],
            dealers: dealers.rows
        });
    }

    if (req.method === 'PUT') {
        const { user_id, plan, plan_card_limit, subscription_status, is_admin, shop_enabled } = req.body;

        if (!user_id) return res.status(400).json({ success: false, error: 'user_id is required' });

        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (plan !== undefined) {
            updates.push(`plan = $${paramIndex++}`);
            params.push(plan);
        }
        if (plan_card_limit !== undefined) {
            updates.push(`plan_card_limit = $${paramIndex++}`);
            params.push(parseInt(plan_card_limit));
        }
        if (subscription_status !== undefined) {
            updates.push(`subscription_status = $${paramIndex++}`);
            params.push(subscription_status);
        }
        if (is_admin !== undefined) {
            updates.push(`is_admin = $${paramIndex++}`);
            params.push(is_admin === true);
        }
        if (shop_enabled !== undefined) {
            updates.push(`shop_enabled = $${paramIndex++}`);
            params.push(shop_enabled === true);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        updates.push(`updated_at = NOW()`);
        params.push(user_id);

        await retryQuery(
            () => pool.query(
                `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
                params
            ),
            'SuperAdmin - Update dealer'
        );

        return res.status(200).json({ success: true, message: 'Dealer updated' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
