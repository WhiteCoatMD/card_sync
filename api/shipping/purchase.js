/**
 * Purchase Shipping Label API
 * POST /api/shipping/purchase — buy label at selected rate
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { buyLabel } = require('../../lib/shipping');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { order_id, shipment_id, rate_id, to_address, weight_oz } = req.body;

        if (!shipment_id || !rate_id) {
            return res.status(400).json({ success: false, error: 'shipment_id and rate_id are required' });
        }

        const result = await buyLabel(shipment_id, rate_id);

        // Save shipment record
        await retryQuery(
            () => pool.query(
                `INSERT INTO shipments (user_id, order_id, easypost_shipment_id, easypost_tracker_id, tracking_number, carrier, service, rate_amount, label_url, status, to_name, to_street1, to_street2, to_city, to_state, to_zip, weight_oz)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'purchased', $10, $11, $12, $13, $14, $15, $16)`,
                [req.user.id, order_id || null, shipment_id, result.tracker_id, result.tracking_number,
                 result.carrier, result.service, result.rate, result.label_url,
                 to_address?.name || null, to_address?.street1 || null, to_address?.street2 || null,
                 to_address?.city || null, to_address?.state || null, to_address?.zip || null,
                 weight_oz || 3]
            ),
            'Shipping - Save'
        );

        // Update order with tracking info if order_id provided
        if (order_id) {
            await retryQuery(
                () => pool.query(
                    'UPDATE orders SET shipping_tracking = $1, shipping_carrier = $2, shipping_label_url = $3, updated_at = NOW() WHERE id = $4 AND dealer_id = $5',
                    [result.tracking_number, result.carrier, result.label_url, order_id, req.user.id]
                ),
                'Shipping - Update order'
            );
        }

        return res.status(200).json({
            success: true,
            tracking_number: result.tracking_number,
            label_url: result.label_url,
            carrier: result.carrier,
            service: result.service,
            rate: result.rate,
        });
    } catch (error) {
        console.error('Shipping purchase error:', error);
        return res.status(500).json({ success: false, error: 'Failed to purchase label: ' + error.message });
    }
});
