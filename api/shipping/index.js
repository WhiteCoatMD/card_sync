/**
 * Shipments API
 * GET /api/shipping — list shipment history
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const { order_id } = req.query;
    const conditions = ['s.user_id = $1'];
    const params = [req.user.id];
    let idx = 2;

    if (order_id) {
        conditions.push(`s.order_id = $${idx++}`);
        params.push(parseInt(order_id));
    }

    const result = await retryQuery(
        () => pool.query(
            `SELECT s.* FROM shipments s WHERE ${conditions.join(' AND ')} ORDER BY s.created_at DESC LIMIT 50`,
            params
        ),
        'Shipping - List'
    );

    return res.status(200).json({ success: true, shipments: result.rows });
});
