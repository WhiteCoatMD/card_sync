/**
 * Facebook Post Schedule
 * GET  /api/facebook/schedule — get current schedule settings
 * POST /api/facebook/schedule — update schedule settings
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');

const pool = getPool();

const VALID_SCHEDULES = ['daily_5', 'daily_10', 'twice_daily_5', null];

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        const result = await pool.query(
            `SELECT post_schedule, schedule_time, auto_post_new, auto_post_price_drop
             FROM facebook_connections WHERE user_id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Facebook not connected' });
        }

        return res.status(200).json({ success: true, schedule: result.rows[0] });
    }

    if (req.method === 'POST') {
        const { post_schedule, schedule_time, auto_post_new, auto_post_price_drop } = req.body;

        // Validate schedule value
        if (post_schedule !== undefined && !VALID_SCHEDULES.includes(post_schedule)) {
            return res.status(400).json({ success: false, error: 'Invalid post_schedule. Use daily_5, daily_10, twice_daily_5, or null.' });
        }

        // Validate schedule_time format (HH:MM)
        if (schedule_time !== undefined && schedule_time !== null) {
            const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
            if (!timeRegex.test(schedule_time)) {
                return res.status(400).json({ success: false, error: 'Invalid schedule_time. Use HH:MM format (e.g. 18:00).' });
            }
        }

        const result = await pool.query(
            `UPDATE facebook_connections
             SET post_schedule = COALESCE($1, post_schedule),
                 schedule_time = COALESCE($2, schedule_time),
                 auto_post_new = COALESCE($3, auto_post_new),
                 auto_post_price_drop = COALESCE($4, auto_post_price_drop),
                 updated_at = NOW()
             WHERE user_id = $5
             RETURNING post_schedule, schedule_time, auto_post_new, auto_post_price_drop`,
            [
                post_schedule !== undefined ? post_schedule : null,
                schedule_time !== undefined ? schedule_time : null,
                auto_post_new !== undefined ? auto_post_new : null,
                auto_post_price_drop !== undefined ? auto_post_price_drop : null,
                req.user.id,
            ]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Facebook not connected' });
        }

        return res.status(200).json({ success: true, message: 'Schedule updated', schedule: result.rows[0] });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
