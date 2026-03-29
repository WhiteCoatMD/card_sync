/**
 * Purchase Shipping Label API
 * POST /api/shipping/purchase — charge dealer via Stripe, then buy EasyPost label
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { buyLabel } = require('../../lib/shipping');
const { getStripe, getDealerStripeAccount } = require('../../lib/stripe');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { order_id, shipment_id, rate_id, rate_amount, to_address, weight_oz } = req.body;

        if (!shipment_id || !rate_id) {
            return res.status(400).json({ success: false, error: 'shipment_id and rate_id are required' });
        }

        if (!rate_amount || rate_amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid rate amount' });
        }

        // Check dealer has Stripe connected
        const stripe = getStripe();
        const dealerAccount = await getDealerStripeAccount(req.user.id);

        if (!stripe || !dealerAccount) {
            return res.status(400).json({ success: false, error: 'Connect your Stripe account first to purchase shipping labels' });
        }

        // Charge the dealer's connected Stripe account
        const amountCents = Math.round(parseFloat(rate_amount) * 100);

        let paymentIntent;
        try {
            paymentIntent = await stripe.paymentIntents.create({
                amount: amountCents,
                currency: 'usd',
                description: `Shipping label${order_id ? ' for Order #' + order_id : ''}`,
                payment_method_types: ['card'],
                confirm: true,
                customer: undefined,
                metadata: {
                    type: 'shipping_label',
                    order_id: order_id ? order_id.toString() : '',
                    dealer_id: req.user.id.toString(),
                },
            }, {
                stripeAccount: dealerAccount.accountId,
            });
        } catch (stripeErr) {
            console.error('Stripe charge failed:', stripeErr.message);
            return res.status(402).json({
                success: false,
                error: 'Payment failed — ' + (stripeErr.message || 'unable to charge your account. Add a payment method to your Stripe account.'),
            });
        }

        if (paymentIntent.status !== 'succeeded') {
            return res.status(402).json({ success: false, error: 'Payment not completed. Status: ' + paymentIntent.status });
        }

        // Payment succeeded — now buy the label
        let result;
        try {
            result = await buyLabel(shipment_id, rate_id);
        } catch (labelErr) {
            // Label failed after payment — refund
            try {
                await stripe.refunds.create({ payment_intent: paymentIntent.id }, { stripeAccount: dealerAccount.accountId });
            } catch (refundErr) {
                console.error('Refund failed:', refundErr.message);
            }
            return res.status(500).json({ success: false, error: 'Label purchase failed after payment. You have been refunded.' });
        }

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

        // Update order with tracking info
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
            charged: rate_amount,
        });
    } catch (error) {
        console.error('Shipping purchase error:', error);
        return res.status(500).json({ success: false, error: 'Failed to purchase label: ' + error.message });
    }
});
