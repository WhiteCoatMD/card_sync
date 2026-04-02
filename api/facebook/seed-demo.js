/**
 * Seed demo inventory for Facebook App Review
 * POST /api/facebook/seed-demo
 * Admin only, one-time use
 */

const { requireAuth, createUser } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');

const DEMO_CARDS = [
    {
        category: 'pokemon',
        name: 'Charizard ex',
        set_name: 'Obsidian Flames',
        card_number: '223/197',
        rarity: 'Special Art Rare',
        condition: 'near_mint',
        quantity: 1,
        buy_price: 45.00,
        sell_price: 89.99,
        image_url: 'https://images.pokemontcg.io/sv3/223_hires.png',
        description: 'Charizard ex Special Art Rare from Obsidian Flames'
    },
    {
        category: 'pokemon',
        name: 'Pikachu VMAX',
        set_name: 'Vivid Voltage',
        card_number: '044/185',
        rarity: 'VMAX',
        condition: 'near_mint',
        quantity: 1,
        buy_price: 12.00,
        sell_price: 24.99,
        image_url: 'https://images.pokemontcg.io/swsh4/44_hires.png',
        description: 'Pikachu VMAX from Vivid Voltage'
    },
    {
        category: 'pokemon',
        name: 'Umbreon VMAX',
        set_name: 'Evolving Skies',
        card_number: '215/203',
        rarity: 'Alternate Art Secret',
        condition: 'mint',
        quantity: 1,
        buy_price: 150.00,
        sell_price: 299.99,
        image_url: 'https://images.pokemontcg.io/swsh7/215_hires.png',
        description: 'Umbreon VMAX Alternate Art from Evolving Skies'
    },
    {
        category: 'magic',
        name: 'Black Lotus',
        set_name: 'Alpha',
        card_number: null,
        rarity: 'Rare',
        condition: 'heavily_played',
        quantity: 1,
        buy_price: 25000.00,
        sell_price: 49999.99,
        image_url: 'https://cards.scryfall.io/large/front/b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7571.jpg',
        description: 'Alpha Black Lotus — heavily played but iconic'
    },
    {
        category: 'magic',
        name: 'Lightning Bolt',
        set_name: 'Fourth Edition',
        card_number: null,
        rarity: 'Common',
        condition: 'lightly_played',
        quantity: 4,
        buy_price: 1.00,
        sell_price: 2.99,
        image_url: 'https://cards.scryfall.io/large/front/e/3/e3285e6b-3e79-4d7c-bf96-d920f973b122.jpg',
        description: 'Classic Lightning Bolt from Fourth Edition'
    },
    {
        category: 'sports',
        name: 'Mike Trout Rookie',
        set_name: '2011 Topps Update',
        card_number: 'US175',
        rarity: 'Rookie Card',
        condition: 'near_mint',
        quantity: 1,
        buy_price: 200.00,
        sell_price: 449.99,
        image_url: null,
        description: '2011 Topps Update Mike Trout RC'
    }
];

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    if (!req.user.is_admin) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const email = 'metareview@collect-sync.com';
    const password = 'MetaReview2026!';
    const displayName = 'Meta App Reviewer';

    const pool = getPool();

    try {
        let userId;
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            userId = existing.rows[0].id;
            // Clear any existing demo inventory
            await pool.query("DELETE FROM inventory WHERE user_id = $1", [userId]);
        } else {
            const user = await createUser(email, password, displayName);
            userId = user.id;
        }
        let inserted = 0;

        for (const card of DEMO_CARDS) {
            await pool.query(
                `INSERT INTO inventory (user_id, category, name, set_name, card_number, rarity, condition, quantity, buy_price, sell_price, image_url, description, status)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'available')`,
                [userId, card.category, card.name, card.set_name, card.card_number, card.rarity, card.condition, card.quantity, card.buy_price, card.sell_price, card.image_url, card.description]
            );
            inserted++;
        }

        return res.status(200).json({
            success: true,
            message: `Account ready with ${inserted} demo cards`,
            credentials: { email, password }
        });
    } catch (err) {
        console.error('Seed demo error:', err);
        return res.status(500).json({ success: false, error: 'Seed failed: ' + err.message });
    }
});
