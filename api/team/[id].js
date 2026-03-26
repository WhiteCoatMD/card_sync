/**
 * Team Member API
 * PUT    /api/team/:id — update role
 * DELETE /api/team/:id — remove from team
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { hasFeature } = require('../../lib/plans');

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

    const { id } = req.query;

    if (req.method === 'PUT') {
        try {
            const { role } = req.body;
            const validRoles = ['manager', 'employee'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ success: false, error: 'Role must be manager or employee' });
            }

            const result = await pool.query(
                'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND owner_id = $3 RETURNING id, email, role',
                [role, id, req.user.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Team member not found' });
            }

            return res.status(200).json({ success: true, member: result.rows[0] });
        } catch (error) {
            console.error('Team update error:', error);
            return res.status(500).json({ success: false, error: 'Failed to update member' });
        }
    }

    if (req.method === 'DELETE') {
        try {
            // Don't allow removing yourself
            if (parseInt(id) === req.user.id) {
                return res.status(400).json({ success: false, error: 'Cannot remove yourself from the team' });
            }

            const result = await pool.query(
                'DELETE FROM users WHERE id = $1 AND owner_id = $2 RETURNING id',
                [id, req.user.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Team member not found' });
            }

            return res.status(200).json({ success: true, message: 'Team member removed' });
        } catch (error) {
            console.error('Team remove error:', error);
            return res.status(500).json({ success: false, error: 'Failed to remove member' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
