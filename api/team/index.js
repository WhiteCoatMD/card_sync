/**
 * Team Management API
 * GET  /api/team — list team members
 * POST /api/team — invite team member
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { hasFeature } = require('../../lib/plans');
const crypto = require('crypto');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (!hasFeature(req.user.plan, 'multi_user')) {
        return res.status(403).json({ success: false, error: 'Team management requires Business plan or higher.', upgrade_required: true });
    }

    if (req.user.role !== 'owner' && !req.user.is_admin) {
        return res.status(403).json({ success: false, error: 'Only the account owner can manage the team.' });
    }

    if (req.method === 'GET') {
        try {
            const members = await retryQuery(
                () => pool.query(
                    `SELECT id, email, display_name, role, created_at, last_login_at
                     FROM users WHERE owner_id = $1 OR id = $1 ORDER BY created_at`,
                    [req.user.id]
                ),
                'Team - List'
            );

            const invites = await retryQuery(
                () => pool.query(
                    `SELECT id, email, role, accepted, created_at, expires_at
                     FROM team_invites WHERE owner_id = $1 AND accepted = false AND expires_at > NOW()
                     ORDER BY created_at DESC`,
                    [req.user.id]
                ),
                'Team - Invites'
            );

            return res.status(200).json({
                success: true,
                members: members.rows,
                pending_invites: invites.rows,
            });
        } catch (error) {
            console.error('Team list error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch team' });
        }
    }

    if (req.method === 'POST') {
        try {
            const { email, role } = req.body;

            if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

            const validRoles = ['manager', 'employee'];
            const memberRole = validRoles.includes(role) ? role : 'employee';

            // Check if already on team
            const existing = await pool.query(
                'SELECT id FROM users WHERE email = $1 AND owner_id = $2',
                [email, req.user.id]
            );
            if (existing.rows.length > 0) {
                return res.status(400).json({ success: false, error: 'This person is already on your team' });
            }

            const token = crypto.randomBytes(32).toString('hex');

            await pool.query(
                `INSERT INTO team_invites (owner_id, email, role, token)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT DO NOTHING`,
                [req.user.id, email, memberRole, token]
            );

            // TODO: Send email invitation via SendGrid

            return res.status(201).json({
                success: true,
                message: `Invitation sent to ${email}`,
                invite_link: `/signup.html?invite=${token}`,
            });
        } catch (error) {
            console.error('Team invite error:', error);
            return res.status(500).json({ success: false, error: 'Failed to send invite' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
