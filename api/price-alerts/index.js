/**
 * Price Alerts API
 * GET  /api/price-alerts — list active alerts
 * POST /api/price-alerts — create a price alert
 * PUT  /api/price-alerts — dismiss/deactivate an alert
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
            () => pool.query(
                `SELECT pa.*, i.image_url, i.sell_price, i.market_price as current_market_price
                 FROM price_alerts pa
                 LEFT JOIN inventory i ON pa.inventory_id = i.id
                 WHERE pa.user_id = $1 AND pa.active = true
                 ORDER BY pa.triggered DESC, pa.created_at DESC`,
                [req.user.id]
            ),
            'PriceAlerts - List'
        );

        return res.status(200).json({
            success: true,
            alerts: result.rows,
            triggered_count: result.rows.filter(a => a.triggered).length,
        });
    }

    if (req.method === 'POST') {
        const { inventory_id, card_name, category, direction, target_price } = req.body;

        if (!card_name) return res.status(400).json({ success: false, error: 'Card name is required' });
        if (!direction || !['above', 'below'].includes(direction)) {
            return res.status(400).json({ success: false, error: 'direction must be "above" or "below"' });
        }
        if (!target_price || parseFloat(target_price) <= 0) {
            return res.status(400).json({ success: false, error: 'Valid target price is required' });
        }

        const result = await retryQuery(
            () => pool.query(
                `INSERT INTO price_alerts (user_id, inventory_id, card_name, category, direction, target_price)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [req.user.id, inventory_id || null, card_name, category || null, direction, parseFloat(target_price)]
            ),
            'PriceAlerts - Create'
        );

        return res.status(201).json({ success: true, alert: result.rows[0] });
    }

    if (req.method === 'PUT') {
        const { alert_id, active } = req.body;
        if (!alert_id) return res.status(400).json({ success: false, error: 'alert_id is required' });

        await retryQuery(
            () => pool.query(
                'UPDATE price_alerts SET active = $1 WHERE id = $2 AND user_id = $3',
                [active === true, alert_id, req.user.id]
            ),
            'PriceAlerts - Update'
        );

        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
