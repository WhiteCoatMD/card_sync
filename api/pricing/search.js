/**
 * Pricing Search API
 * GET /api/pricing/search?name=Charizard&category=pokemon&set_name=Shining+Fates
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { searchPricing } = require('../../lib/pricing');

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { name, category, set_name } = req.query;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Card name is required' });
        }

        const result = await searchPricing(name, category || null, set_name || null);

        return res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error('Pricing search error:', error);
        return res.status(500).json({ success: false, error: 'Failed to search pricing' });
    }
});
