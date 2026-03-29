/**
 * Shipping Rates API
 * POST /api/shipping/rates — get rate quotes for an order
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { createShipment } = require('../../lib/shipping');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { order_id, to_address, weight_oz } = req.body;

        if (!to_address || !to_address.name || !to_address.street1 || !to_address.city || !to_address.state || !to_address.zip) {
            return res.status(400).json({ success: false, error: 'Complete shipping address required' });
        }

        // Get dealer's return address
        const userResult = await retryQuery(
            () => pool.query(
                'SELECT ship_from_name, ship_from_street1, ship_from_city, ship_from_state, ship_from_zip, display_name FROM users WHERE id = $1',
                [req.user.id]
            ),
            'Shipping - Get from address'
        );

        const user = userResult.rows[0];
        if (!user.ship_from_street1) {
            return res.status(400).json({ success: false, error: 'Set your return address in Integrations first' });
        }

        const fromAddress = {
            name: user.ship_from_name || user.display_name || 'Dealer',
            street1: user.ship_from_street1,
            city: user.ship_from_city,
            state: user.ship_from_state,
            zip: user.ship_from_zip,
        };

        const result = await createShipment(fromAddress, to_address, { weight_oz: weight_oz || 3 });

        return res.status(200).json({
            success: true,
            shipment_id: result.shipment_id,
            rates: result.rates,
        });
    } catch (error) {
        console.error('Shipping rates error:', error);
        return res.status(500).json({ success: false, error: 'Failed to get shipping rates: ' + error.message });
    }
});
