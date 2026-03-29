/**
 * Alerts API
 * GET  /api/alerts — get unacknowledged low stock alerts
 * PUT  /api/alerts — acknowledge alerts
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getLowStockAlerts, acknowledgeAlerts } = require('../../lib/stock-alerts');

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        const alerts = await getLowStockAlerts(req.user.id);
        return res.status(200).json({ success: true, alerts, count: alerts.length });
    }

    if (req.method === 'PUT') {
        const { alert_ids } = req.body;
        if (!alert_ids || !Array.isArray(alert_ids)) {
            return res.status(400).json({ success: false, error: 'alert_ids array is required' });
        }
        await acknowledgeAlerts(req.user.id, alert_ids.map(id => parseInt(id)));
        return res.status(200).json({ success: true, message: 'Alerts acknowledged' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
