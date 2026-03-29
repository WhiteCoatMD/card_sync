/**
 * Grading Submissions API
 * GET  /api/grading — list submissions with item counts and stats
 * POST /api/grading — create a new submission with items
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
        try {
            const { status } = req.query;
            const conditions = ['gs.user_id = $1'];
            const params = [req.user.id];
            let idx = 2;

            if (status) {
                conditions.push(`gs.status = $${idx++}`);
                params.push(status);
            }

            const result = await retryQuery(
                () => pool.query(
                    `SELECT gs.*,
                        (SELECT COUNT(*) FROM grading_submission_items WHERE submission_id = gs.id) as item_count,
                        (SELECT COUNT(*) FROM grading_submission_items WHERE submission_id = gs.id AND grade IS NOT NULL) as graded_count,
                        (SELECT COALESCE(SUM(grading_fee), 0) FROM grading_submission_items WHERE submission_id = gs.id) as total_fees,
                        (SELECT COALESCE(SUM(post_grade_value - pre_grade_value), 0) FROM grading_submission_items WHERE submission_id = gs.id AND post_grade_value IS NOT NULL AND pre_grade_value IS NOT NULL) as total_roi
                     FROM grading_submissions gs
                     WHERE ${conditions.join(' AND ')}
                     ORDER BY gs.created_at DESC`,
                    params
                ),
                'Grading - List'
            );

            // Summary stats
            const statsResult = await retryQuery(
                () => pool.query(
                    `SELECT
                        COUNT(*) as total_submissions,
                        COUNT(*) FILTER (WHERE status IN ('shipped', 'received', 'grading')) as in_progress,
                        COUNT(*) FILTER (WHERE status = 'returned') as completed,
                        (SELECT COUNT(*) FROM grading_submission_items gsi JOIN grading_submissions gs2 ON gsi.submission_id = gs2.id WHERE gs2.user_id = $1) as total_cards,
                        (SELECT AVG(grade) FROM grading_submission_items gsi JOIN grading_submissions gs2 ON gsi.submission_id = gs2.id WHERE gs2.user_id = $1 AND grade IS NOT NULL) as avg_grade,
                        (SELECT COALESCE(SUM(total_cost), 0) FROM grading_submissions WHERE user_id = $1) as total_spent
                     FROM grading_submissions WHERE user_id = $1`,
                    [req.user.id]
                ),
                'Grading - Stats'
            );

            return res.status(200).json({
                success: true,
                submissions: result.rows,
                stats: statsResult.rows[0],
            });
        } catch (error) {
            console.error('Grading list error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch submissions' });
        }
    }

    if (req.method === 'POST') {
        try {
            const { grading_company, service_level, submission_number, tracking_number, notes, items, total_cost } = req.body;

            if (!grading_company) return res.status(400).json({ success: false, error: 'Grading company is required' });
            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ success: false, error: 'At least one card is required' });
            }

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                const totalDeclared = items.reduce((sum, i) => sum + (parseFloat(i.declared_value) || 0), 0);

                const subResult = await client.query(
                    `INSERT INTO grading_submissions (user_id, grading_company, service_level, submission_number, tracking_number, notes, total_declared_value, total_cost, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
                    [req.user.id, grading_company, service_level || null, submission_number || null,
                     tracking_number || null, notes || null, totalDeclared, parseFloat(total_cost) || 0,
                     submission_number ? 'shipped' : 'preparing']
                );
                const submission = subResult.rows[0];

                for (const item of items) {
                    if (!item.card_name) continue;
                    await client.query(
                        `INSERT INTO grading_submission_items (submission_id, inventory_id, card_name, declared_value, grading_fee, pre_grade_value)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [submission.id, item.inventory_id || null, item.card_name,
                         parseFloat(item.declared_value) || null, parseFloat(item.grading_fee) || null,
                         parseFloat(item.pre_grade_value) || null]
                    );
                }

                await client.query('COMMIT');

                return res.status(201).json({ success: true, submission });
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('Grading create error:', error);
            return res.status(500).json({ success: false, error: 'Failed to create submission' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
