/**
 * TCGplayer CSV Export API
 * GET /api/tcgplayer/export — generate TCGplayer-formatted CSV for bulk upload
 */

const { requireAuth } = require('../../lib/auth');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');

const pool = getPool();

function getConditionName(condition) {
    const map = {
        mint: 'Near Mint',
        near_mint: 'Near Mint',
        lightly_played: 'Lightly Played',
        moderately_played: 'Moderately Played',
        heavily_played: 'Heavily Played',
        damaged: 'Damaged',
    };
    return map[condition] || 'Near Mint';
}

function csvEscape(str) {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

module.exports = requireAuth(async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization');
        return res.status(200).end();
    }
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const result = await retryQuery(
            () => pool.query(
                `SELECT name, category, set_name, card_number, rarity, condition, quantity, sell_price
                 FROM inventory
                 WHERE user_id = $1 AND status = 'available' AND quantity > 0 AND sell_price IS NOT NULL AND category != 'sports'
                 ORDER BY category, name`,
                [req.user.id]
            ),
            'TCGplayer Export'
        );

        if (result.rows.length === 0) {
            return res.status(200).json({ success: false, error: 'No available cards with prices to export' });
        }

        // TCGplayer CSV format columns
        const headers = ['TCGplayer Id', 'Product Line', 'Set Name', 'Product Name', 'Title', 'Number', 'Rarity', 'Condition', 'TCG Market Price', 'TCG Direct Low', 'TCG Low Price', 'TCG Low Price With Shipping', 'Total Quantity', 'Add to Quantity', 'TCG Marketplace Price', 'Photo URL'];

        const rows = result.rows.map(item => {
            const productLine = {
                pokemon: 'Pokemon',
                magic: 'Magic',
                yugioh: 'YuGiOh',
                lorcana: 'Lorcana',
                one_piece: 'One Piece Card Game',
                digimon: 'Digimon',
                flesh_and_blood: 'Flesh & Blood TCG',
                dragonball: 'Dragon Ball Super CCG',
            }[item.category] || item.category;

            return [
                '',                                    // TCGplayer Id (leave blank for manual matching)
                csvEscape(productLine),               // Product Line
                csvEscape(item.set_name || ''),        // Set Name
                csvEscape(item.name),                  // Product Name
                '',                                    // Title
                csvEscape(item.card_number || ''),      // Number
                csvEscape(item.rarity || ''),           // Rarity
                csvEscape(getConditionName(item.condition)), // Condition
                '',                                    // TCG Market Price
                '',                                    // TCG Direct Low
                '',                                    // TCG Low Price
                '',                                    // TCG Low Price With Shipping
                item.quantity,                         // Total Quantity
                item.quantity,                         // Add to Quantity
                parseFloat(item.sell_price).toFixed(2), // TCG Marketplace Price
                '',                                    // Photo URL
            ].join(',');
        });

        const csv = headers.join(',') + '\n' + rows.join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="tcgplayer-inventory-' + new Date().toISOString().split('T')[0] + '.csv"');
        return res.status(200).send(csv);
    } catch (error) {
        console.error('TCGplayer export error:', error);
        return res.status(500).json({ success: false, error: 'Export failed' });
    }
});
