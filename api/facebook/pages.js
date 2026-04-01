/**
 * Facebook Pages
 * GET  /api/facebook/pages — list user's Facebook Pages
 * POST /api/facebook/pages — select a page to post to
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { getUserPages } = require('../../lib/facebook');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        // Get user's access token from facebook_connections
        const conn = await pool.query(
            'SELECT access_token FROM facebook_connections WHERE user_id = $1',
            [req.user.id]
        );

        if (conn.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Facebook not connected' });
        }

        const pages = await getUserPages(conn.rows[0].access_token);

        return res.status(200).json({ success: true, pages });
    }

    if (req.method === 'POST') {
        const { page_id, page_name, page_access_token } = req.body;

        if (!page_id || !page_name || !page_access_token) {
            return res.status(400).json({ success: false, error: 'page_id, page_name, and page_access_token are required' });
        }

        await pool.query(
            `UPDATE facebook_connections
             SET page_id = $1, page_name = $2, page_access_token = $3, updated_at = NOW()
             WHERE user_id = $4`,
            [page_id, page_name, page_access_token, req.user.id]
        );

        return res.status(200).json({ success: true, message: 'Page selected', page_id, page_name });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
