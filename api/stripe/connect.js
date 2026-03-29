/**
 * Stripe Connect — Start OAuth flow
 * GET /api/stripe/connect — returns the Stripe Connect OAuth URL
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getConnectUrl } = require('../../lib/stripe');

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const url = getConnectUrl(req.user.id.toString());
    if (!url) {
        return res.status(500).json({ success: false, error: 'Stripe Connect is not configured' });
    }

    return res.status(200).json({ success: true, redirect_url: url });
});
