/**
 * Facebook OAuth Callback — exchange auth code for tokens
 * GET /api/facebook/callback?code=xxx&state=xxx
 */

const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { exchangeCodeForTokens, getLongLivedToken } = require('../../lib/facebook');

const pool = getPool();

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { code, state } = req.query;

        if (!code) {
            return res.redirect('/integrations.html?facebook=error&msg=no_code');
        }

        // Decode user ID from state
        let userId;
        try {
            const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
            userId = decoded.userId;
        } catch {
            return res.redirect('/integrations.html?facebook=error&msg=invalid_state');
        }

        // Exchange code for short-lived token
        const tokens = await exchangeCodeForTokens(code);

        // Exchange short-lived token for long-lived token (60 days)
        const longLived = await getLongLivedToken(tokens.access_token);

        // Calculate expiration — use expires_in if provided, otherwise default to 60 days
        const expiresInSeconds = longLived.expires_in || 60 * 24 * 60 * 60;
        const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

        // Upsert Facebook connection
        await pool.query(
            `INSERT INTO facebook_connections (user_id, access_token, token_expires_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id)
             DO UPDATE SET access_token = $2, token_expires_at = $3, updated_at = NOW()`,
            [userId, longLived.access_token, expiresAt]
        );

        return res.redirect('/integrations.html?facebook=connected');
    } catch (error) {
        console.error('Facebook callback error:', error);
        return res.redirect('/integrations.html?facebook=error&msg=' + encodeURIComponent(error.message));
    }
};
