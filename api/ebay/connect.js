/**
 * eBay OAuth Connect — redirect dealer to eBay consent screen
 * GET /api/ebay/connect
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getConsentUrl } = require('../../lib/ebay');

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    // Encode user ID in state for the callback
    const state = Buffer.from(JSON.stringify({ userId: req.user.id })).toString('base64');
    const url = getConsentUrl(state);

    return res.status(200).json({ success: true, redirect_url: url });
});
