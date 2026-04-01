/**
 * Facebook Graph API Integration Library
 * OAuth 2.0 (Facebook Login for Business) + Page Publishing
 */

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const OAUTH_DIALOG_URL = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;
const REDIRECT_URI = 'https://collect-sync.com/api/facebook/callback';

const SCOPES = [
    'pages_manage_posts',
    'pages_read_engagement',
    'pages_read_user_content',
    'pages_show_list',
    'business_management',
    'public_profile',
].join(',');

/**
 * Generate the Facebook OAuth consent URL for a dealer to connect
 */
function getConsentUrl(state) {
    const params = new URLSearchParams({
        client_id: process.env.FACEBOOK_APP_ID,
        redirect_uri: REDIRECT_URI,
        state: state || '',
        scope: SCOPES,
        response_type: 'code',
    });
    return `${OAUTH_DIALOG_URL}?${params}`;
}

/**
 * Exchange authorization code for a short-lived access token
 */
async function exchangeCodeForTokens(code) {
    const params = new URLSearchParams({
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
    });

    const res = await fetch(`${GRAPH_API_BASE}/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Facebook token exchange failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    return {
        access_token: data.access_token,
        token_type: data.token_type,
        expires_in: data.expires_in,
    };
}

/**
 * Exchange a short-lived token for a long-lived one (60 days)
 */
async function getLongLivedToken(shortToken) {
    const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        fb_exchange_token: shortToken,
    });

    const res = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${params}`, {
        method: 'GET',
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Facebook long-lived token exchange failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    return {
        access_token: data.access_token,
        token_type: data.token_type,
        expires_in: data.expires_in,
    };
}

/**
 * Get list of Pages the user manages (with page access tokens)
 */
async function getUserPages(userAccessToken) {
    const params = new URLSearchParams({
        access_token: userAccessToken,
        fields: 'id,name,access_token,category,fan_count,picture',
    });

    const res = await fetch(`${GRAPH_API_BASE}/me/accounts?${params}`, {
        method: 'GET',
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Facebook get pages failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    return data.data || [];
}

/**
 * Get a valid page access token from the database
 */
async function getValidToken(pool, userId) {
    const result = await pool.query(
        'SELECT * FROM facebook_connections WHERE user_id = $1',
        [userId]
    );

    if (result.rows.length === 0) return null;

    const conn = result.rows[0];

    // Check if token is still valid (with 5 min buffer)
    const now = new Date();
    const expiresAt = new Date(conn.token_expires_at);
    if (expiresAt <= new Date(now.getTime() + 5 * 60 * 1000)) {
        // Token expired or about to expire
        console.error('Facebook token expired for user:', userId);
        await pool.query(
            "UPDATE facebook_connections SET last_sync_status = 'error', last_sync_message = $1, updated_at = NOW() WHERE user_id = $2",
            ['Token expired. Please reconnect Facebook.', userId]
        );
        return null;
    }

    return {
        pageToken: conn.page_access_token,
        pageId: conn.page_id,
        pageName: conn.page_name,
    };
}

/**
 * Make an authenticated Facebook Graph API call
 */
async function graphApiCall(accessToken, method, path, body) {
    const url = `${GRAPH_API_BASE}${path}`;

    if (method === 'GET') {
        const params = new URLSearchParams(body || {});
        params.set('access_token', accessToken);
        const fullUrl = `${url}?${params}`;

        const res = await fetch(fullUrl, { method: 'GET' });
        const text = await res.text();

        let data;
        try { data = JSON.parse(text); } catch { data = text; }

        if (!res.ok || data.error) {
            const errMsg = data.error ? data.error.message : (typeof data === 'string' ? data : JSON.stringify(data));
            throw new Error(`Facebook API GET ${path}: ${res.status} ${errMsg}`);
        }
        return data;
    }

    // POST request
    const formData = new URLSearchParams(body || {});
    formData.set('access_token', accessToken);

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
    });

    const text = await res.text();

    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!res.ok || (data && data.error)) {
        const errMsg = data.error ? data.error.message : (typeof data === 'string' ? data : JSON.stringify(data));
        throw new Error(`Facebook API POST ${path}: ${res.status} ${errMsg}`);
    }
    return data;
}

/**
 * Post a card listing to a Facebook Page
 */
async function postCardToPage(pageToken, pageId, card, subdomain) {
    const price = parseFloat(card.sell_price || 0).toFixed(2);
    const storeUrl = `https://collect-sync.com/store/${subdomain}`;

    const lines = [
        `${card.name} - ${card.game}`,
        `Set: ${card.set_name}`,
        `Condition: ${card.condition}`,
        `Price: $${price}`,
        '',
        `Shop now: ${storeUrl}`,
    ];
    const message = lines.join('\n');

    if (card.image_url) {
        // Post as photo with message
        return await graphApiCall(pageToken, 'POST', `/${pageId}/photos`, {
            message,
            url: card.image_url,
        });
    }

    // Post as link to store
    return await graphApiCall(pageToken, 'POST', `/${pageId}/feed`, {
        message,
        link: storeUrl,
    });
}

/**
 * Generate Marketplace-ready listing data (copy-paste assistant)
 */
function formatMarketplaceAssist(card) {
    const price = parseFloat(card.sell_price || 0).toFixed(2);
    const conditionMap = {
        mint: 'New',
        near_mint: 'Like New',
        lightly_played: 'Good',
        moderately_played: 'Fair',
        heavily_played: 'Fair',
        damaged: 'Poor',
    };

    const title = `${card.name} - ${card.game} ${card.set_name}`;

    const descLines = [
        `${card.name}`,
        `Game: ${card.game}`,
        `Set: ${card.set_name}`,
        card.rarity ? `Rarity: ${card.rarity}` : null,
        `Condition: ${card.condition}`,
        '',
        'Trading card listed via Collect Sync.',
    ].filter(Boolean);

    return {
        title,
        price,
        description: descLines.join('\n'),
        category: 'Toys & Games',
        condition: conditionMap[card.condition] || 'Good',
    };
}

module.exports = {
    getConsentUrl,
    exchangeCodeForTokens,
    getLongLivedToken,
    getUserPages,
    getValidToken,
    graphApiCall,
    postCardToPage,
    formatMarketplaceAssist,
};
