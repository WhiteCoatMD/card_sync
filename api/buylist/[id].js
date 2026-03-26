/**
 * Buylist Detail API
 * GET /api/buylist/:id — get submission with items
 * PUT /api/buylist/:id — update status, set offer prices
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
    if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ success: false, error: 'Valid buylist ID required' });
    }

    if (req.method === 'GET') {
        try {
            const buylistResult = await retryQuery(
                () => pool.query('SELECT * FROM buylist WHERE id = $1 AND dealer_id = $2', [id, req.user.id]),
                'Buylist - Get'
            );

            if (buylistResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Submission not found' });
            }

            const itemsResult = await retryQuery(
                () => pool.query('SELECT * FROM buylist_items WHERE buylist_id = $1 ORDER BY id', [id]),
                'Buylist - Get Items'
            );

            return res.status(200).json({
                success: true,
                submission: { ...buylistResult.rows[0], items: itemsResult.rows },
            });
        } catch (error) {
            console.error('Buylist get error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch submission' });
        }
    }

    if (req.method === 'PUT') {
        try {
            const { status, total_offer, notes, items } = req.body;

            // Update buylist status
            const updates = [];
            const params = [];
            let paramIndex = 1;

            if (status) { updates.push(`status = $${paramIndex++}`); params.push(status); }
            if (total_offer !== undefined) { updates.push(`total_offer = $${paramIndex++}`); params.push(total_offer); }
            if (notes !== undefined) { updates.push(`notes = $${paramIndex++}`); params.push(notes); }
            updates.push('updated_at = NOW()');
            params.push(id);
            params.push(req.user.id);

            const result = await pool.query(
                `UPDATE buylist SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND dealer_id = $${paramIndex++} RETURNING *`,
                params
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Submission not found' });
            }

            // Update individual item offer prices/status if provided
            if (items && Array.isArray(items)) {
                for (const item of items) {
                    if (!item.id) continue;
                    const itemUpdates = [];
                    const itemParams = [];
                    let idx = 1;

                    if (item.offer_price !== undefined) { itemUpdates.push(`offer_price = $${idx++}`); itemParams.push(item.offer_price); }
                    if (item.status) { itemUpdates.push(`status = $${idx++}`); itemParams.push(item.status); }

                    if (itemUpdates.length > 0) {
                        itemParams.push(item.id);
                        await pool.query(
                            `UPDATE buylist_items SET ${itemUpdates.join(', ')} WHERE id = $${idx} AND buylist_id = $${idx + 1}`,
                            [...itemParams, id]
                        );
                    }
                }
            }

            // If accepted, auto-calculate total offer
            if (status === 'accepted') {
                const totalResult = await pool.query(
                    `SELECT COALESCE(SUM(offer_price * quantity), 0) as total
                     FROM buylist_items WHERE buylist_id = $1 AND status != 'rejected'`,
                    [id]
                );
                await pool.query(
                    'UPDATE buylist SET total_offer = $1 WHERE id = $2',
                    [totalResult.rows[0].total, id]
                );
            }

            return res.status(200).json({ success: true, submission: result.rows[0] });
        } catch (error) {
            console.error('Buylist update error:', error);
            return res.status(500).json({ success: false, error: 'Failed to update submission' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
