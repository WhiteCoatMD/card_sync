/**
 * Pricing Search API
 * GET /api/pricing/search?name=Charizard&category=pokemon&set_name=Shining+Fates
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { searchPricing } = require('../../lib/pricing');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { name, category, set_name, item_id } = req.query;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Card name is required' });
        }

        const result = await searchPricing(name, category || null, set_name || null);

        // Save market price and image to inventory if item_id provided
        if (item_id && result.results && result.results.length > 0) {
            const best = result.results[0];
            if (best.market_price !== null) {
                const updateFields = ['market_price = $1', 'market_price_updated_at = NOW()'];
                const updateParams = [best.market_price];
                let idx = 2;

                if (best.image_url) {
                    updateFields.push(`image_url = COALESCE(NULLIF(image_url, ''), $${idx++})`);
                    updateParams.push(best.image_url);
                }

                updateParams.push(parseInt(item_id));
                try {
                    await pool.query(
                        `UPDATE inventory SET ${updateFields.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1}`,
                        [...updateParams, req.user.id]
                    );
                } catch (e) { console.error('Failed to save market price for item', item_id, e.message); }
            }
        }

        return res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error('Pricing search error:', error);
        return res.status(500).json({ success: false, error: 'Failed to search pricing' });
    }
});
