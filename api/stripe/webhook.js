/**
 * Stripe Webhook — Handle payment events
 * POST /api/stripe/webhook
 */

const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');

const pool = getPool();

// Disable Vercel's body parser — Stripe needs raw body for signature verification
module.exports.config = { api: { bodyParser: false } };

async function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const rawBody = await getRawBody(req);
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!webhookSecret) {
            console.error('STRIPE_WEBHOOK_SECRET not configured');
            return res.status(500).json({ error: 'Webhook not configured' });
        }

        // We need to determine which dealer's Stripe key to use for verification
        // Parse the raw body to get the metadata first
        let event;
        try {
            const payload = JSON.parse(rawBody.toString());
            event = payload;
        } catch (e) {
            return res.status(400).json({ error: 'Invalid payload' });
        }

        // Handle checkout.session.completed
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const orderId = session.metadata?.order_id;
            const dealerId = session.metadata?.dealer_id;

            if (!orderId) {
                console.error('Webhook: No order_id in session metadata');
                return res.status(200).json({ received: true });
            }

            // Verify this order exists and is pending
            const orderResult = await retryQuery(
                () => pool.query(
                    "SELECT id, status FROM orders WHERE id = $1 AND stripe_session_id = $2",
                    [orderId, session.id]
                ),
                'Webhook - Get order'
            );

            if (orderResult.rows.length === 0) {
                console.error('Webhook: Order not found', orderId);
                return res.status(200).json({ received: true });
            }

            if (orderResult.rows[0].status === 'completed') {
                return res.status(200).json({ received: true, message: 'Already processed' });
            }

            // Process payment in a transaction
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                // Mark order as completed
                await client.query(
                    "UPDATE orders SET status = 'completed', stripe_payment_intent_id = $1, updated_at = NOW() WHERE id = $2",
                    [session.payment_intent, orderId]
                );

                // Decrement inventory quantities
                const items = await client.query(
                    'SELECT inventory_id, quantity FROM order_items WHERE order_id = $1',
                    [orderId]
                );

                for (const item of items.rows) {
                    await client.query(
                        'UPDATE inventory SET quantity = GREATEST(0, quantity - $1), updated_at = NOW() WHERE id = $2',
                        [item.quantity, item.inventory_id]
                    );

                    // Mark as sold if quantity reaches 0
                    await client.query(
                        "UPDATE inventory SET status = 'sold' WHERE id = $1 AND quantity <= 0",
                        [item.inventory_id]
                    );
                }

                await client.query('COMMIT');
                console.log('Webhook: Order', orderId, 'completed successfully');
            } catch (err) {
                await client.query('ROLLBACK');
                console.error('Webhook: Transaction failed', err.message);
                return res.status(500).json({ error: 'Processing failed' });
            } finally {
                client.release();
            }

            // Send confirmation email (best effort)
            try {
                const { sendEmail } = require('../../lib/email');
                const customerEmail = session.customer_details?.email || session.customer_email;
                if (customerEmail && sendEmail) {
                    await sendEmail({
                        to: customerEmail,
                        subject: 'Order Confirmed — Collect Sync',
                        html: `<h2>Thank you for your order!</h2>
                               <p>Your order #${orderId} has been confirmed and payment received.</p>
                               <p>The dealer will ship your cards soon.</p>
                               <p>Total: $${(session.amount_total / 100).toFixed(2)}</p>`,
                    });
                }
            } catch (e) {
                console.error('Webhook: Email failed', e.message);
            }
        }

        return res.status(200).json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        return res.status(400).json({ error: 'Webhook handler failed' });
    }
};
