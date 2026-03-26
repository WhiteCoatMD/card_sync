/**
 * eBay OAuth Callback — exchange auth code for tokens
 * GET /api/ebay/callback?code=xxx&state=xxx
 */

const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { exchangeCodeForTokens } = require('../../lib/ebay');

const pool = getPool();

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { code, state } = req.query;

        if (!code) {
            return res.redirect('/integrations.html?ebay=error&msg=no_code');
        }

        // Decode user ID from state
        let userId;
        try {
            const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
            userId = decoded.userId;
        } catch {
            return res.redirect('/integrations.html?ebay=error&msg=invalid_state');
        }

        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code);
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

        // Upsert eBay connection
        await pool.query(
            `INSERT INTO ebay_connections (user_id, access_token, refresh_token, token_expires_at, sync_enabled)
             VALUES ($1, $2, $3, $4, true)
             ON CONFLICT (user_id)
             DO UPDATE SET access_token = $2, refresh_token = $3, token_expires_at = $4, sync_enabled = true, updated_at = NOW()`,
            [userId, tokens.access_token, tokens.refresh_token, expiresAt]
        );

        return res.redirect('/integrations.html?ebay=connected');
    } catch (error) {
        console.error('eBay callback error:', error);
        return res.redirect('/integrations.html?ebay=error&msg=' + encodeURIComponent(error.message));
    }
};
