/**
 * Bulk Import API
 * POST /api/inventory/import — import cards from CSV data
 * Body: { cards: [{ name, category, set_name, ... }] }
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { checkCardLimit, hasFeature } = require('../../lib/plans');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    // Check feature access
    if (!hasFeature(req.user.plan, 'bulk_import')) {
        return res.status(403).json({
            success: false,
            error: 'Bulk import requires Pro plan or higher.',
            upgrade_required: true,
        });
    }

    try {
        const { cards } = req.body;

        if (!cards || !Array.isArray(cards) || cards.length === 0) {
            return res.status(400).json({ success: false, error: 'No cards provided' });
        }

        if (cards.length > 500) {
            return res.status(400).json({ success: false, error: 'Maximum 500 cards per import' });
        }

        // Check plan limits
        const limitCheck = await checkCardLimit(pool, req.user.id, req.user.plan);
        if (limitCheck.limit !== -1 && (limitCheck.current + cards.length) > limitCheck.limit) {
            return res.status(403).json({
                success: false,
                error: `Import would exceed your card limit. You have ${limitCheck.remaining} slots remaining (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan for more.`,
                upgrade_required: true,
                remaining: limitCheck.remaining,
            });
        }

        let imported = 0;
        let skipped = 0;
        const errors = [];

        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            if (!card.name || !card.category) {
                skipped++;
                errors.push({ row: i + 1, error: 'Missing name or category' });
                continue;
            }

            try {
                await pool.query(
                    `INSERT INTO inventory (user_id, category, name, set_name, card_number, rarity, condition, quantity, buy_price, sell_price, image_url, description, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                    [
                        req.user.id, card.category, card.name, card.set_name || null,
                        card.card_number || null, card.rarity || null,
                        card.condition || 'near_mint', parseInt(card.quantity) || 1,
                        card.buy_price ? parseFloat(card.buy_price) : null,
                        card.sell_price ? parseFloat(card.sell_price) : null,
                        card.image_url || null, card.description || null,
                        card.status || 'available'
                    ]
                );
                imported++;
            } catch (err) {
                skipped++;
                errors.push({ row: i + 1, error: err.message });
            }
        }

        return res.status(200).json({
            success: true,
            imported,
            skipped,
            total: cards.length,
            errors: errors.slice(0, 10), // Only return first 10 errors
        });
    } catch (error) {
        console.error('Import error:', error);
        return res.status(500).json({ success: false, error: 'Import failed' });
    }
});
