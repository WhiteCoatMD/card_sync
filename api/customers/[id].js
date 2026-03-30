/**
 * Customer Detail API
 * GET    /api/customers/:id — customer details + order history
 * PUT    /api/customers/:id — update customer
 * DELETE /api/customers/:id — delete customer
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id } = req.query;

    if (req.method === 'GET') {
        const custResult = await retryQuery(
            () => pool.query('SELECT * FROM customers WHERE id = $1 AND dealer_id = $2', [id, req.user.id]),
            'Customer - Get'
        );
        if (custResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Customer not found' });

        // Get order history for this customer by name/email match
        const customer = custResult.rows[0];
        const orderConditions = ['o.dealer_id = $1'];
        const orderParams = [req.user.id];
        let idx = 2;

        if (customer.email) {
            orderConditions.push(`(o.customer_email = $${idx} OR o.customer_name = $${idx + 1})`);
            orderParams.push(customer.email, customer.name);
            idx += 2;
        } else {
            orderConditions.push(`o.customer_name = $${idx}`);
            orderParams.push(customer.name);
            idx++;
        }

        const orders = await retryQuery(
            () => pool.query(
                `SELECT o.id, o.type, o.status, o.total_amount, o.created_at, o.shipping_tracking,
                        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
                 FROM orders o WHERE ${orderConditions.join(' AND ')}
                 ORDER BY o.created_at DESC LIMIT 50`,
                orderParams
            ),
            'Customer - Orders'
        );

        return res.status(200).json({ success: true, customer, orders: orders.rows });
    }

    if (req.method === 'PUT') {
        const { name, email, phone, address, notes, tags } = req.body;
        const updates = ['updated_at = NOW()'];
        const params = [];
        let pIdx = 1;

        if (name !== undefined) { updates.push(`name = $${pIdx++}`); params.push(name); }
        if (email !== undefined) { updates.push(`email = $${pIdx++}`); params.push(email || null); }
        if (phone !== undefined) { updates.push(`phone = $${pIdx++}`); params.push(phone || null); }
        if (address !== undefined) { updates.push(`address = $${pIdx++}`); params.push(address || null); }
        if (notes !== undefined) { updates.push(`notes = $${pIdx++}`); params.push(notes || null); }
        if (tags !== undefined) { updates.push(`tags = $${pIdx++}`); params.push(tags || null); }

        params.push(id, req.user.id);
        const result = await pool.query(
            `UPDATE customers SET ${updates.join(', ')} WHERE id = $${pIdx++} AND dealer_id = $${pIdx} RETURNING *`,
            params
        );

        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Customer not found' });
        return res.status(200).json({ success: true, customer: result.rows[0] });
    }

    if (req.method === 'DELETE') {
        const result = await pool.query('DELETE FROM customers WHERE id = $1 AND dealer_id = $2 RETURNING id', [id, req.user.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Customer not found' });
        return res.status(200).json({ success: true, message: 'Customer deleted' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
