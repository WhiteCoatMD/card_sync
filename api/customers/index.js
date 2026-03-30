/**
 * Customer CRM API
 * GET  /api/customers — list customers with stats
 * POST /api/customers — add or update a customer
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
        const { search, tag, sort = 'last_order_at', order = 'desc' } = req.query;
        const conditions = ['c.dealer_id = $1'];
        const params = [req.user.id];
        let idx = 2;

        if (search) {
            conditions.push(`(c.name ILIKE $${idx} OR c.email ILIKE $${idx})`);
            params.push(`%${search}%`);
            idx++;
        }
        if (tag) {
            conditions.push(`c.tags ILIKE $${idx}`);
            params.push(`%${tag}%`);
            idx++;
        }

        const allowedSorts = ['last_order_at', 'total_spent', 'order_count', 'name', 'created_at'];
        const sortCol = allowedSorts.includes(sort) ? sort : 'last_order_at';
        const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

        const result = await retryQuery(
            () => pool.query(
                `SELECT c.* FROM customers c
                 WHERE ${conditions.join(' AND ')}
                 ORDER BY ${sortCol} ${sortOrder} NULLS LAST
                 LIMIT 200`,
                params
            ),
            'Customers - List'
        );

        // Summary stats
        const stats = await retryQuery(
            () => pool.query(
                `SELECT COUNT(*) as total,
                        COALESCE(SUM(total_spent), 0) as lifetime_revenue,
                        COALESCE(AVG(total_spent), 0) as avg_spent,
                        COUNT(*) FILTER (WHERE last_order_at > NOW() - INTERVAL '30 days') as active_30d
                 FROM customers WHERE dealer_id = $1`,
                [req.user.id]
            ),
            'Customers - Stats'
        );

        return res.status(200).json({ success: true, customers: result.rows, stats: stats.rows[0] });
    }

    if (req.method === 'POST') {
        const { name, email, phone, address, notes, tags } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Customer name is required' });

        // Check if customer exists by email
        if (email) {
            const existing = await retryQuery(
                () => pool.query(
                    'SELECT id FROM customers WHERE dealer_id = $1 AND email = $2',
                    [req.user.id, email]
                ),
                'Customers - Check existing'
            );

            if (existing.rows.length > 0) {
                // Update existing
                await retryQuery(
                    () => pool.query(
                        'UPDATE customers SET name = $1, phone = COALESCE($2, phone), address = COALESCE($3, address), notes = COALESCE($4, notes), tags = COALESCE($5, tags), updated_at = NOW() WHERE id = $6',
                        [name, phone, address, notes, tags, existing.rows[0].id]
                    ),
                    'Customers - Update'
                );
                return res.status(200).json({ success: true, message: 'Customer updated', id: existing.rows[0].id });
            }
        }

        const result = await retryQuery(
            () => pool.query(
                'INSERT INTO customers (dealer_id, name, email, phone, address, notes, tags) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                [req.user.id, name, email || null, phone || null, address || null, notes || null, tags || null]
            ),
            'Customers - Create'
        );

        return res.status(201).json({ success: true, message: 'Customer added', id: result.rows[0].id });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
