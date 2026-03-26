/**
 * Bulk Price Lookup API
 * POST /api/pricing/lookup — look up market prices for inventory items
 * Body: { item_ids: [1, 2, 3] } or { all: true } for entire inventory
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { lookupInventoryPrice } = require('../../lib/pricing');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { item_ids, all } = req.body;

        let items;
        if (all) {
            const result = await retryQuery(
                () => pool.query('SELECT id, name, category, set_name, card_number, sell_price FROM inventory WHERE status != $1 ORDER BY id LIMIT 100', ['unlisted']),
                'Pricing - Get All'
            );
            items = result.rows;
        } else if (item_ids && Array.isArray(item_ids) && item_ids.length > 0) {
            const placeholders = item_ids.map((_, i) => `$${i + 1}`).join(',');
            const result = await retryQuery(
                () => pool.query(`SELECT id, name, category, set_name, card_number, sell_price FROM inventory WHERE id IN (${placeholders})`, item_ids),
                'Pricing - Get Items'
            );
            items = result.rows;
        } else {
            return res.status(400).json({ success: false, error: 'Provide item_ids array or set all: true' });
        }

        // Look up prices (with small delays to respect rate limits)
        const results = [];
        for (const item of items) {
            const priceData = await lookupInventoryPrice(item);
            results.push({
                ...priceData,
                name: item.name,
                category: item.category,
                current_sell_price: item.sell_price ? parseFloat(item.sell_price) : null,
            });
        }

        return res.status(200).json({
            success: true,
            prices: results,
            checked: results.length,
        });
    } catch (error) {
        console.error('Pricing lookup error:', error);
        return res.status(500).json({ success: false, error: 'Failed to look up prices' });
    }
});
