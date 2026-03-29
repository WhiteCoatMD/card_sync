/**
 * Public Checkout API — Guest checkout via Stripe Connect
 * POST /api/public/checkout — create Stripe Checkout Session with platform fee
 */

const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { getDealerBySubdomain } = require('../../lib/subdomain');
const { getStripe, getDealerStripeAccount } = require('../../lib/stripe');
const { getPlatformFeePercent } = require('../../lib/plans');

const pool = getPool();

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { subdomain, items, customer_email, customer_name } = req.body;

        if (!subdomain || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'subdomain and items are required' });
        }

        const stripe = getStripe();
        if (!stripe) {
            return res.status(500).json({ success: false, error: 'Payment system is not configured' });
        }

        // Look up dealer
        const dealer = await getDealerBySubdomain(subdomain);
        if (!dealer) {
            return res.status(404).json({ success: false, error: 'Store not found' });
        }

        // Get dealer's Stripe Connect account
        const dealerAccount = await getDealerStripeAccount(dealer.id);
        if (!dealerAccount) {
            return res.status(400).json({ success: false, error: 'This store has not set up payments yet' });
        }

        // Validate all items are available and in stock
        const itemIds = items.map(i => parseInt(i.inventory_id));
        const placeholders = itemIds.map((_, i) => `$${i + 2}`).join(',');
        const inventoryResult = await retryQuery(
            () => pool.query(
                `SELECT id, name, sell_price, quantity, image_url, status FROM inventory
                 WHERE user_id = $1 AND id IN (${placeholders}) AND status = 'available'`,
                [dealer.id, ...itemIds]
            ),
            'Checkout - Validate items'
        );

        const inventoryMap = {};
        for (const row of inventoryResult.rows) {
            inventoryMap[row.id] = row;
        }

        // Build line items and validate stock
        const lineItems = [];
        const orderItems = [];
        let totalAmount = 0;

        for (const item of items) {
            const inv = inventoryMap[item.inventory_id];
            if (!inv) {
                return res.status(400).json({ success: false, error: `Item ${item.inventory_id} is not available` });
            }
            const qty = parseInt(item.quantity) || 1;
            if (qty > inv.quantity) {
                return res.status(400).json({ success: false, error: `Not enough stock for "${inv.name}" (${inv.quantity} available)` });
            }
            if (!inv.sell_price || parseFloat(inv.sell_price) <= 0) {
                return res.status(400).json({ success: false, error: `"${inv.name}" does not have a price set` });
            }

            const unitPrice = parseFloat(inv.sell_price);
            totalAmount += unitPrice * qty;

            lineItems.push({
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: inv.name,
                        ...(inv.image_url ? { images: [inv.image_url] } : {}),
                    },
                    unit_amount: Math.round(unitPrice * 100),
                },
                quantity: qty,
            });

            orderItems.push({
                inventory_id: inv.id,
                quantity: qty,
                unit_price: unitPrice,
            });
        }

        // Calculate platform fee based on dealer's plan
        // Stripe fee (2.9% + $0.30) is passed through to dealer automatically by Stripe
        // Platform fee is our cut on top
        const feePercent = getPlatformFeePercent(dealerAccount.plan);
        const platformFee = Math.round(totalAmount * 100 * (feePercent / 100)); // in cents

        // Create pending order in DB
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const orderResult = await client.query(
                `INSERT INTO orders (dealer_id, customer_name, customer_email, type, status, total_amount)
                 VALUES ($1, $2, $3, 'sell', 'pending', $4) RETURNING id`,
                [dealer.id, customer_name || 'Guest', customer_email || null, totalAmount]
            );
            const orderId = orderResult.rows[0].id;

            for (const oi of orderItems) {
                await client.query(
                    'INSERT INTO order_items (order_id, inventory_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
                    [orderId, oi.inventory_id, oi.quantity, oi.unit_price]
                );
            }

            // Create Stripe Checkout Session with Connect
            const storeUrl = `https://${subdomain}.collect-sync.com`;
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: lineItems,
                mode: 'payment',
                success_url: `${storeUrl}/store.html?order=success&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${storeUrl}/store.html?order=cancelled`,
                ...(customer_email ? { customer_email } : {}),
                payment_intent_data: {
                    application_fee_amount: platformFee,
                    transfer_data: {
                        destination: dealerAccount.accountId,
                    },
                },
                metadata: {
                    order_id: orderId.toString(),
                    dealer_id: dealer.id.toString(),
                    platform_fee_percent: feePercent.toString(),
                },
            });

            await client.query(
                'UPDATE orders SET stripe_session_id = $1 WHERE id = $2',
                [session.id, orderId]
            );

            await client.query('COMMIT');

            return res.status(200).json({
                success: true,
                url: session.url,
                order_id: orderId,
            });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Checkout error:', error);
        return res.status(500).json({ success: false, error: 'Checkout failed. Please try again.' });
    }
};
