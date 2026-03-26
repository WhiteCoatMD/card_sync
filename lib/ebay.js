/**
 * eBay Integration Library
 * OAuth 2.0 + Inventory API + Browse API (sold listings)
 */

const SANDBOX_AUTH_URL = 'https://auth.sandbox.ebay.com/oauth2/authorize';
const SANDBOX_TOKEN_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';
const SANDBOX_API_URL = 'https://api.sandbox.ebay.com';

const PROD_AUTH_URL = 'https://auth.ebay.com/oauth2/authorize';
const PROD_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const PROD_API_URL = 'https://api.ebay.com';

const SCOPES = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    'https://api.ebay.com/oauth/api_scope/sell.account',
].join(' ');

function isSandbox() {
    return process.env.EBAY_SANDBOX === 'true';
}

function getAuthUrl() { return isSandbox() ? SANDBOX_AUTH_URL : PROD_AUTH_URL; }
function getTokenUrl() { return isSandbox() ? SANDBOX_TOKEN_URL : PROD_TOKEN_URL; }
function getApiUrl() { return isSandbox() ? SANDBOX_API_URL : PROD_API_URL; }

/**
 * Generate the OAuth consent URL for a dealer to connect their eBay account
 */
function getConsentUrl(state) {
    const params = new URLSearchParams({
        client_id: process.env.EBAY_CLIENT_ID,
        redirect_uri: process.env.EBAY_REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES,
        state: state || '',
    });
    return `${getAuthUrl()}?${params}`;
}

/**
 * Exchange authorization code for access + refresh tokens
 */
async function exchangeCodeForTokens(code) {
    const credentials = Buffer.from(
        `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
    ).toString('base64');

    const res = await fetch(getTokenUrl(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`,
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: process.env.EBAY_REDIRECT_URI,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`eBay token exchange failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in, // seconds
        token_type: data.token_type,
    };
}

/**
 * Refresh an expired access token using the refresh token
 */
async function refreshAccessToken(refreshToken) {
    const credentials = Buffer.from(
        `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
    ).toString('base64');

    const res = await fetch(getTokenUrl(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`,
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            scope: SCOPES,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`eBay token refresh failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    return {
        access_token: data.access_token,
        expires_in: data.expires_in,
    };
}

/**
 * Get a valid access token for a dealer (auto-refreshes if expired)
 */
async function getValidToken(pool, userId) {
    const result = await pool.query(
        'SELECT * FROM ebay_connections WHERE user_id = $1',
        [userId]
    );

    if (result.rows.length === 0) return null;

    const conn = result.rows[0];

    // Check if token is still valid (with 5 min buffer)
    const now = new Date();
    const expiresAt = new Date(conn.token_expires_at);
    if (expiresAt > new Date(now.getTime() + 5 * 60 * 1000)) {
        return conn.access_token;
    }

    // Token expired, refresh it
    try {
        const tokens = await refreshAccessToken(conn.refresh_token);
        const newExpires = new Date(now.getTime() + tokens.expires_in * 1000);

        await pool.query(
            'UPDATE ebay_connections SET access_token = $1, token_expires_at = $2, updated_at = NOW() WHERE user_id = $3',
            [tokens.access_token, newExpires, userId]
        );

        return tokens.access_token;
    } catch (error) {
        console.error('eBay token refresh failed:', error.message);
        await pool.query(
            "UPDATE ebay_connections SET last_sync_status = 'error', last_sync_message = $1, updated_at = NOW() WHERE user_id = $2",
            ['Token refresh failed. Please reconnect eBay.', userId]
        );
        return null;
    }
}

/**
 * Make an authenticated eBay API call
 */
async function ebayApiCall(accessToken, method, path, body) {
    const url = `${getApiUrl()}${path}`;
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Content-Language': 'en-US',
        },
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);
    const text = await res.text();

    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!res.ok) {
        throw new Error(`eBay API ${method} ${path}: ${res.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }
    return data;
}

/**
 * Create or update an inventory item on eBay
 */
async function createOrUpdateInventoryItem(accessToken, sku, item) {
    const ebayItem = {
        availability: {
            shipToLocationAvailability: {
                quantity: item.quantity || 0,
            },
        },
        condition: mapCondition(item.condition),
        product: {
            title: item.name,
            description: item.description || item.name,
            aspects: {},
        },
    };

    if (item.category) {
        ebayItem.product.aspects['Type'] = [item.category];
    }
    if (item.set_name) {
        ebayItem.product.aspects['Set'] = [item.set_name];
    }
    if (item.rarity) {
        ebayItem.product.aspects['Rarity'] = [item.rarity];
    }
    if (item.image_url) {
        ebayItem.product.imageUrls = [item.image_url];
    }

    return await ebayApiCall(accessToken, 'PUT', `/sell/inventory/v1/inventory_item/${sku}`, ebayItem);
}

/**
 * Create an offer for an inventory item
 */
async function createOffer(accessToken, sku, price, categoryId) {
    const offer = {
        sku,
        marketplaceId: 'EBAY_US',
        format: 'FIXED_PRICE',
        availableQuantity: 1,
        pricingSummary: {
            price: {
                currency: 'USD',
                value: price.toString(),
            },
        },
        listingDescription: '',
        categoryId: categoryId || '183454', // Trading Cards default
    };

    return await ebayApiCall(accessToken, 'POST', '/sell/inventory/v1/offer', offer);
}

/**
 * Publish an offer to make it a live listing
 */
async function publishOffer(accessToken, offerId) {
    return await ebayApiCall(accessToken, 'POST', `/sell/inventory/v1/offer/${offerId}/publish`);
}

/**
 * Bulk update prices and quantities
 */
async function bulkUpdatePriceQuantity(accessToken, items) {
    const requests = items.map(item => ({
        sku: item.sku,
        shipToLocationAvailability: {
            quantity: item.quantity || 0,
        },
        offers: [{
            offerId: item.offerId,
            availableQuantity: item.quantity || 0,
            price: {
                currency: 'USD',
                value: item.price.toString(),
            },
        }],
    }));

    return await ebayApiCall(accessToken, 'POST', '/sell/inventory/v1/bulk_update_price_quantity', {
        requests,
    });
}

/**
 * Search eBay sold listings for pricing (Browse API)
 */
async function searchSoldListings(name, category) {
    // Client credentials grant for Browse API (no user auth needed)
    const credentials = Buffer.from(
        `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
    ).toString('base64');

    const tokenRes = await fetch(getTokenUrl(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`,
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            scope: 'https://api.ebay.com/oauth/api_scope',
        }),
    });

    if (!tokenRes.ok) return { results: [], error: 'Failed to get eBay app token' };
    const tokenData = await tokenRes.json();

    // Search for items
    const query = encodeURIComponent(name);
    const data = await ebayApiCall(
        tokenData.access_token,
        'GET',
        `/buy/browse/v1/item_summary/search?q=${query}&limit=5&sort=-price`,
        null
    );

    if (!data.itemSummaries) return { results: [] };

    return {
        results: data.itemSummaries.map(item => ({
            title: item.title,
            price: item.price?.value ? parseFloat(item.price.value) : null,
            currency: item.price?.currency || 'USD',
            condition: item.condition || '',
            image_url: item.thumbnailImages?.[0]?.imageUrl || item.image?.imageUrl || null,
            item_url: item.itemWebUrl || null,
            seller: item.seller?.username || '',
        })),
    };
}

function mapCondition(condition) {
    const map = {
        mint: 'NEW',
        near_mint: 'LIKE_NEW',
        lightly_played: 'VERY_GOOD',
        moderately_played: 'GOOD',
        heavily_played: 'ACCEPTABLE',
        damaged: 'FOR_PARTS_OR_NOT_WORKING',
    };
    return map[condition] || 'LIKE_NEW';
}

module.exports = {
    getConsentUrl,
    exchangeCodeForTokens,
    refreshAccessToken,
    getValidToken,
    ebayApiCall,
    createOrUpdateInventoryItem,
    createOffer,
    publishOffer,
    bulkUpdatePriceQuantity,
    searchSoldListings,
    isSandbox,
};
