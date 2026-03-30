/**
 * Collection Appraisal API — Public, no auth required
 * POST /api/public/appraise — get market values for a list of cards
 */

const { setCorsHeaders } = require('../../lib/cors-security');
const { searchPricing } = require('../../lib/pricing');

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { cards } = req.body;

        if (!cards || !Array.isArray(cards) || cards.length === 0) {
            return res.status(400).json({ success: false, error: 'Cards array is required' });
        }

        if (cards.length > 25) {
            return res.status(400).json({ success: false, error: 'Maximum 25 cards per appraisal' });
        }

        const results = [];
        let totalValue = 0;
        let foundCount = 0;

        for (const card of cards) {
            if (!card.name) continue;

            try {
                const pricing = await searchPricing(card.name, card.category || null, card.set_name || null);

                if (pricing.results && pricing.results.length > 0) {
                    // Sort by lowest price for name match
                    const matches = pricing.results
                        .filter(r => r.market_price !== null)
                        .sort((a, b) => a.market_price - b.market_price);

                    const best = matches[0];
                    if (best) {
                        const qty = parseInt(card.quantity) || 1;
                        const value = best.market_price * qty;
                        totalValue += value;
                        foundCount++;

                        results.push({
                            name: card.name,
                            category: card.category || best.source,
                            market_price: best.market_price,
                            foil_price: best.foil_price,
                            quantity: qty,
                            total_value: value,
                            source: best.source,
                            image_url: best.image_url,
                            matched_name: best.name,
                        });
                        continue;
                    }
                }

                results.push({
                    name: card.name,
                    category: card.category || null,
                    market_price: null,
                    quantity: parseInt(card.quantity) || 1,
                    total_value: 0,
                    source: null,
                    error: 'No pricing found',
                });
            } catch (e) {
                results.push({
                    name: card.name,
                    market_price: null,
                    total_value: 0,
                    error: 'Lookup failed',
                });
            }

            // Rate limit
            await new Promise(r => setTimeout(r, 200));
        }

        return res.status(200).json({
            success: true,
            results,
            summary: {
                total_cards: cards.length,
                priced: foundCount,
                not_found: cards.length - foundCount,
                estimated_value: totalValue,
            },
        });
    } catch (error) {
        console.error('Appraisal error:', error);
        return res.status(500).json({ success: false, error: 'Appraisal failed' });
    }
};
