/**
 * TCGplayer Seller API Integration
 * Handles authentication, product search, listing creation, and inventory sync
 *
 * TCGplayer API: https://docs.tcgplayer.com/docs
 * Auth: Bearer token from client credentials
 */

const { getPool } = require('./db');
const { retryQuery } = require('./db-retry');

const TCGPLAYER_API_URL = 'https://api.tcgplayer.com';
const TCGPLAYER_AUTH_URL = 'https://api.tcgplayer.com/token';

const pool = getPool();

// Token cache (platform-level, not per-dealer)
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Get a TCGplayer API bearer token using client credentials
 */
async function getAccessToken() {
    const now = Date.now();
    if (cachedToken && tokenExpiresAt > now + 60000) return cachedToken;

    const clientId = process.env.TCGPLAYER_PUBLIC_KEY;
    const clientSecret = process.env.TCGPLAYER_PRIVATE_KEY;

    if (!clientId || !clientSecret) return null;

    const res = await fetch(TCGPLAYER_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`TCGplayer auth failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiresAt = now + (data.expires_in * 1000);
    return cachedToken;
}

/**
 * Make an authenticated TCGplayer API call
 */
async function tcgApiCall(method, path, body) {
    const token = await getAccessToken();
    if (!token) throw new Error('TCGplayer API credentials not configured');

    const url = `${TCGPLAYER_API_URL}${path}`;
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);
    const text = await res.text();

    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!res.ok) {
        throw new Error(`TCGplayer ${method} ${path}: ${res.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }
    return data;
}

/**
 * Map internal category to TCGplayer category ID
 */
function getCategoryId(category) {
    const map = {
        pokemon: 3,       // Pokémon
        magic: 1,         // Magic: The Gathering
        yugioh: 2,        // Yu-Gi-Oh!
        lorcana: 71,      // Disney Lorcana
        one_piece: 67,    // One Piece Card Game
        digimon: 56,      // Digimon Card Game
        flesh_and_blood: 62, // Flesh and Blood
        dragonball: 50,   // Dragon Ball Super
    };
    return map[category] || null;
}

/**
 * Map internal condition to TCGplayer condition ID
 */
function getConditionId(condition) {
    const map = {
        mint: 1,              // Near Mint
        near_mint: 1,         // Near Mint
        lightly_played: 2,    // Lightly Played
        moderately_played: 3, // Moderately Played
        heavily_played: 4,    // Heavily Played
        damaged: 5,           // Damaged
    };
    return map[condition] || 1;
}

/**
 * Search for a product on TCGplayer by name
 */
async function searchProduct(name, categoryId) {
    const params = new URLSearchParams({ q: name, limit: 10 });
    if (categoryId) params.set('categoryId', categoryId);

    const data = await tcgApiCall('GET', `/catalog/products?${params}`);
    return data.results || [];
}

/**
 * Get product details including pricing
 */
async function getProductPricing(productId) {
    const data = await tcgApiCall('GET', `/pricing/product/${productId}`);
    return data.results || [];
}

/**
 * Create or update inventory on TCGplayer seller account
 * Uses the TCGplayer Marketplace API
 */
async function updateSellerInventory(sellerKey, items) {
    // TCGplayer seller inventory update
    // Each item needs: productId, conditionId, quantity, price
    const inventoryItems = items.map(item => ({
        skuId: item.tcgplayer_sku || null,
        productId: parseInt(item.tcgplayer_product_id),
        conditionId: getConditionId(item.condition),
        quantity: item.quantity || 0,
        price: parseFloat(item.sell_price) || 0,
        language: 'English',
    }));

    // TCGplayer uses PUT for inventory updates
    return await tcgApiCall('PUT', '/stores/inventory', inventoryItems);
}

/**
 * Get dealer's TCGplayer connection
 */
async function getTcgplayerConnection(userId) {
    const result = await retryQuery(
        () => pool.query('SELECT * FROM tcgplayer_connections WHERE user_id = $1', [userId]),
        'TCGplayer - Get connection'
    );
    return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Match an inventory item to a TCGplayer product
 * Returns best matching product with ID
 */
async function matchProduct(item) {
    const categoryId = getCategoryId(item.category);
    if (!categoryId) return null;

    try {
        const products = await searchProduct(item.name, categoryId);
        if (products.length === 0) return null;

        // Try exact name match first
        let best = products.find(p =>
            p.name.toLowerCase() === item.name.toLowerCase()
        );

        // Try set match
        if (!best && item.set_name) {
            best = products.find(p =>
                p.name.toLowerCase().includes(item.name.toLowerCase()) &&
                p.groupName && p.groupName.toLowerCase().includes(item.set_name.toLowerCase())
            );
        }

        // Fall back to first result
        if (!best) best = products[0];

        return {
            productId: best.productId,
            name: best.name,
            groupName: best.groupName || '',
            imageUrl: best.imageUrl || null,
        };
    } catch (e) {
        console.error('TCGplayer match error:', e.message);
        return null;
    }
}

module.exports = {
    getAccessToken,
    tcgApiCall,
    getCategoryId,
    getConditionId,
    searchProduct,
    getProductPricing,
    updateSellerInventory,
    getTcgplayerConnection,
    matchProduct,
};
