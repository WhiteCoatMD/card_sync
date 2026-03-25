/**
 * User Logout API
 */

const { getPool } = require('../../lib/db');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const pool = getPool();
            await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
        }

        return res.status(200).json({ success: true, message: 'Logged out' });
    } catch (error) {
        return res.status(200).json({ success: true, message: 'Logged out' });
    }
};
