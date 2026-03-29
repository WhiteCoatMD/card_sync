/**
 * Grading Submission Detail API
 * GET    /api/grading/:id — get submission with items
 * PUT    /api/grading/:id — update submission status, dates, item grades
 * DELETE /api/grading/:id — delete submission (preparing only)
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
    if (!id) return res.status(400).json({ success: false, error: 'Submission ID required' });

    if (req.method === 'GET') {
        try {
            const subResult = await retryQuery(
                () => pool.query('SELECT * FROM grading_submissions WHERE id = $1 AND user_id = $2', [id, req.user.id]),
                'Grading - Get'
            );
            if (subResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Submission not found' });
            }

            const itemsResult = await retryQuery(
                () => pool.query(
                    `SELECT gsi.*, i.image_url, i.category FROM grading_submission_items gsi
                     LEFT JOIN inventory i ON gsi.inventory_id = i.id
                     WHERE gsi.submission_id = $1 ORDER BY gsi.id`,
                    [id]
                ),
                'Grading - Get items'
            );

            return res.status(200).json({
                success: true,
                submission: { ...subResult.rows[0], items: itemsResult.rows },
            });
        } catch (error) {
            console.error('Grading get error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch submission' });
        }
    }

    if (req.method === 'PUT') {
        try {
            const { status, submission_number, tracking_number, return_tracking, notes,
                    date_submitted, date_received, date_completed, date_returned,
                    estimated_completion, total_cost, items } = req.body;

            // Update submission fields
            const updates = ['updated_at = NOW()'];
            const params = [];
            let idx = 1;

            if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }
            if (submission_number !== undefined) { updates.push(`submission_number = $${idx++}`); params.push(submission_number); }
            if (tracking_number !== undefined) { updates.push(`tracking_number = $${idx++}`); params.push(tracking_number); }
            if (return_tracking !== undefined) { updates.push(`return_tracking = $${idx++}`); params.push(return_tracking); }
            if (notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(notes); }
            if (date_submitted !== undefined) { updates.push(`date_submitted = $${idx++}`); params.push(date_submitted); }
            if (date_received !== undefined) { updates.push(`date_received = $${idx++}`); params.push(date_received); }
            if (date_completed !== undefined) { updates.push(`date_completed = $${idx++}`); params.push(date_completed); }
            if (date_returned !== undefined) { updates.push(`date_returned = $${idx++}`); params.push(date_returned); }
            if (estimated_completion !== undefined) { updates.push(`estimated_completion = $${idx++}`); params.push(estimated_completion); }
            if (total_cost !== undefined) { updates.push(`total_cost = $${idx++}`); params.push(parseFloat(total_cost)); }

            params.push(id, req.user.id);
            const result = await pool.query(
                `UPDATE grading_submissions SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
                params
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Submission not found' });
            }

            // Update individual items if provided
            if (items && Array.isArray(items)) {
                for (const item of items) {
                    if (!item.id) continue;
                    const itemUpdates = [];
                    const itemParams = [];
                    let iIdx = 1;

                    if (item.cert_number !== undefined) { itemUpdates.push(`cert_number = $${iIdx++}`); itemParams.push(item.cert_number); }
                    if (item.grade !== undefined) { itemUpdates.push(`grade = $${iIdx++}`); itemParams.push(item.grade ? parseFloat(item.grade) : null); }
                    if (item.grade_label !== undefined) { itemUpdates.push(`grade_label = $${iIdx++}`); itemParams.push(item.grade_label); }
                    if (item.post_grade_value !== undefined) { itemUpdates.push(`post_grade_value = $${iIdx++}`); itemParams.push(item.post_grade_value ? parseFloat(item.post_grade_value) : null); }
                    if (item.grading_fee !== undefined) { itemUpdates.push(`grading_fee = $${iIdx++}`); itemParams.push(item.grading_fee ? parseFloat(item.grading_fee) : null); }

                    if (itemUpdates.length > 0) {
                        itemParams.push(item.id, id);
                        await pool.query(
                            `UPDATE grading_submission_items SET ${itemUpdates.join(', ')} WHERE id = $${iIdx++} AND submission_id = $${iIdx}`,
                            itemParams
                        );
                    }
                }
            }

            return res.status(200).json({ success: true, submission: result.rows[0] });
        } catch (error) {
            console.error('Grading update error:', error);
            return res.status(500).json({ success: false, error: 'Failed to update submission' });
        }
    }

    if (req.method === 'DELETE') {
        try {
            const result = await pool.query(
                "DELETE FROM grading_submissions WHERE id = $1 AND user_id = $2 AND status = 'preparing' RETURNING id",
                [id, req.user.id]
            );
            if (result.rows.length === 0) {
                return res.status(400).json({ success: false, error: 'Can only delete submissions in "preparing" status' });
            }
            return res.status(200).json({ success: true, message: 'Submission deleted' });
        } catch (error) {
            console.error('Grading delete error:', error);
            return res.status(500).json({ success: false, error: 'Failed to delete submission' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
