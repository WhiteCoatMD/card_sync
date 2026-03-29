/**
 * Alert Settings API
 * GET  /api/alerts/settings — get threshold and enabled status
 * PUT  /api/alerts/settings — update threshold and enabled flag
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
            () => pool.query('SELECT low_stock_threshold, low_stock_alerts_enabled FROM users WHERE id = $1', [req.user.id]),
            'AlertSettings - Get'
        );
        const row = result.rows[0] || {};
        return res.status(200).json({
            success: true,
            threshold: row.low_stock_threshold || 5,
            enabled: row.low_stock_alerts_enabled || false,
        });
    }

    if (req.method === 'PUT') {
        const { threshold, enabled } = req.body;
        const updates = [];
        const params = [];
        let idx = 1;

        if (threshold !== undefined) {
            updates.push(`low_stock_threshold = $${idx++}`);
            params.push(Math.max(0, parseInt(threshold) || 5));
        }
        if (enabled !== undefined) {
            updates.push(`low_stock_alerts_enabled = $${idx++}`);
            params.push(enabled === true);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        params.push(req.user.id);
        await retryQuery(
            () => pool.query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, params),
            'AlertSettings - Update'
        );

        return res.status(200).json({ success: true, message: 'Alert settings updated' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
