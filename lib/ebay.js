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
            'Accept-Language': 'en-US',
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
async function createOffer(accessToken, sku, price, item) {
    const description = (item && item.description) || (item && item.name) || 'Trading card listed via Card Sync';
    const quantity = (item && item.quantity) || 1;

    // Use Trading API directly — more reliable, doesn't require business policies opt-in
    return await createListingViaTradingApi(accessToken, item, price);
}

/**
 * Fallback: create listing via Trading API (doesn't require business policies)
 */
async function createListingViaTradingApi(accessToken, item, price) {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
    <RequesterCredentials>
        <eBayAuthToken>${accessToken}</eBayAuthToken>
    </RequesterCredentials>
    <ErrorLanguage>en_US</ErrorLanguage>
    <WarningLevel>High</WarningLevel>
    <Item>
        <Title>${escapeXml(item.name || 'Trading Card')}</Title>
        <Description>${escapeXml(item.description || item.name || 'Trading card')}</Description>
        <PrimaryCategory>
            <CategoryID>183454</CategoryID>
        </PrimaryCategory>
        <StartPrice currencyID="USD">${price}</StartPrice>
        <ConditionID>${mapConditionId(item.condition)}</ConditionID>
        <ConditionDescriptors>
            <ConditionDescriptor>
                <Name>40001</Name>
                <Value>${mapCardConditionDescriptorId(item.condition)}</Value>
            </ConditionDescriptor>
        </ConditionDescriptors>
        <Country>US</Country>
        <Currency>USD</Currency>
        <Location>Harriman, TN</Location>
        <PostalCode>37748</PostalCode>
        <DispatchTimeMax>3</DispatchTimeMax>
        <ListingDuration>GTC</ListingDuration>
        <ListingType>FixedPriceItem</ListingType>
        <Quantity>${item.quantity || 1}</Quantity>
        <ItemSpecifics>
            <NameValueList><Name>Game</Name><Value>${escapeXml(mapGameName(item.category))}</Value></NameValueList>
            <NameValueList><Name>Language</Name><Value>English</Value></NameValueList>
${item.set_name ? `            <NameValueList><Name>Set</Name><Value>${escapeXml(item.set_name)}</Value></NameValueList>` : ''}
${item.rarity ? `            <NameValueList><Name>Rarity</Name><Value>${escapeXml(item.rarity)}</Value></NameValueList>` : ''}
${item.card_number ? `            <NameValueList><Name>Card Number</Name><Value>${escapeXml(item.card_number)}</Value></NameValueList>` : ''}
        </ItemSpecifics>
        <ReturnPolicy>
            <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
            <RefundOption>MoneyBack</RefundOption>
            <ReturnsWithinOption>Days_30</ReturnsWithinOption>
            <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
        </ReturnPolicy>
        <ShippingDetails>
            <ShippingType>Flat</ShippingType>
            <ShippingServiceOptions>
                <ShippingServicePriority>1</ShippingServicePriority>
                <ShippingService>ShippingMethodStandard</ShippingService>
                <ShippingServiceCost currencyID="USD">4.99</ShippingServiceCost>
                <ShippingServiceAdditionalCost currencyID="USD">0.00</ShippingServiceAdditionalCost>
            </ShippingServiceOptions>
        </ShippingDetails>
${item.image_url ? `        <PictureDetails><PictureURL>${escapeXml(item.image_url)}</PictureURL></PictureDetails>` : ''}
    </Item>
</AddItemRequest>`;

    const apiUrl = isSandbox()
        ? 'https://api.sandbox.ebay.com/ws/api.dll'
        : 'https://api.ebay.com/ws/api.dll';

    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/xml',
            'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
            'X-EBAY-API-DEV-NAME': process.env.EBAY_DEV_ID,
            'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID,
            'X-EBAY-API-CERT-NAME': process.env.EBAY_CLIENT_SECRET,
            'X-EBAY-API-SITEID': '0',
            'X-EBAY-API-CALL-NAME': 'AddItem',
        },
        body: xml,
    });

    const text = await res.text();

    // Parse ItemID from response
    const itemIdMatch = text.match(/<ItemID>(\d+)<\/ItemID>/);
    if (itemIdMatch) {
        return { offerId: null, listingId: itemIdMatch[1], method: 'trading_api' };
    }

    // Check for errors
    const errorMatch = text.match(/<ShortMessage>(.*?)<\/ShortMessage>/);
    throw new Error(errorMatch ? errorMatch[1] : 'Trading API listing failed');
}

function escapeXml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mapConditionId(condition) {
    // Trading Cards (183454) valid: 2750=Graded, 4000=Ungraded
    // All ungraded cards use 4000, with ConditionDescriptor 40001 for specific condition
    return '4000';
}

function mapCardConditionDescriptorId(condition) {
    // eBay ConditionDescriptor value IDs for ungraded cards (descriptor 40001)
    // 400010=Near Mint or Better, 400015=Lightly Played, 400016=Moderately Played, 400017=Heavily Played
    const map = {
        mint: '400010',
        near_mint: '400010',
        lightly_played: '400015',
        moderately_played: '400016',
        heavily_played: '400017',
        damaged: '400017',
    };
    return map[condition] || '400010';
}

function mapGameName(category) {
    const map = {
        pokemon: 'Pokémon TCG',
        magic: 'Magic: The Gathering',
        yugioh: 'Yu-Gi-Oh! TCG',
        sports: 'Collectible Card Games',
        one_piece: 'One Piece Card Game',
        lorcana: 'Disney Lorcana',
        digimon: 'Digimon',
        dragonball: 'Dragon Ball Super Card Game',
        flesh_and_blood: 'Flesh and Blood TCG',
        other: 'Collectible Card Games',
    };
    return map[category] || 'Collectible Card Games';
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

/**
 * Create default merchant location (required before publishing offers)
 */
async function ensureMerchantLocation(accessToken) {
    try {
        // Check if location exists
        await ebayApiCall(accessToken, 'GET', '/sell/inventory/v1/location/default', null);
    } catch {
        // Create it
        await ebayApiCall(accessToken, 'POST', '/sell/inventory/v1/location/default', {
            location: {
                address: {
                    city: 'Harriman',
                    stateOrProvince: 'TN',
                    postalCode: '37748',
                    country: 'US',
                },
            },
            locationTypes: ['WAREHOUSE'],
            name: 'Default Location',
            merchantLocationStatus: 'ENABLED',
        });
    }
}

/**
 * Get or create fulfillment, payment, and return policies
 */
async function ensureBusinessPolicies(accessToken) {
    const policies = { fulfillmentPolicyId: '', paymentPolicyId: '', returnPolicyId: '' };

    // Fulfillment policy
    try {
        const fRes = await ebayApiCall(accessToken, 'GET', '/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US', null);
        if (fRes.fulfillmentPolicies && fRes.fulfillmentPolicies.length > 0) {
            policies.fulfillmentPolicyId = fRes.fulfillmentPolicies[0].fulfillmentPolicyId;
        }
    } catch { /* ignore */ }

    if (!policies.fulfillmentPolicyId) {
        try {
            const fp = await ebayApiCall(accessToken, 'POST', '/sell/account/v1/fulfillment_policy', {
                name: 'Card Sync Shipping',
                marketplaceId: 'EBAY_US',
                handlingTime: { value: 3, unit: 'DAY' },
                shippingOptions: [{
                    optionType: 'DOMESTIC',
                    costType: 'FLAT_RATE',
                    shippingServices: [{
                        shippingServiceCode: 'ShippingMethodStandard',
                        shippingCost: { currency: 'USD', value: '4.99' },
                        sortOrder: 1,
                    }],
                }],
            });
            policies.fulfillmentPolicyId = fp.fulfillmentPolicyId;
        } catch (e) { console.error('Fulfillment policy error:', e.message); }
    }

    // Payment policy
    try {
        const pRes = await ebayApiCall(accessToken, 'GET', '/sell/account/v1/payment_policy?marketplace_id=EBAY_US', null);
        if (pRes.paymentPolicies && pRes.paymentPolicies.length > 0) {
            policies.paymentPolicyId = pRes.paymentPolicies[0].paymentPolicyId;
        }
    } catch { /* ignore */ }

    if (!policies.paymentPolicyId) {
        try {
            const pp = await ebayApiCall(accessToken, 'POST', '/sell/account/v1/payment_policy', {
                name: 'Card Sync Payment',
                marketplaceId: 'EBAY_US',
                paymentMethods: [{ paymentMethodType: 'PERSONAL_CHECK' }],
            });
            policies.paymentPolicyId = pp.paymentPolicyId;
        } catch (e) { console.error('Payment policy error:', e.message); }
    }

    // Return policy
    try {
        const rRes = await ebayApiCall(accessToken, 'GET', '/sell/account/v1/return_policy?marketplace_id=EBAY_US', null);
        if (rRes.returnPolicies && rRes.returnPolicies.length > 0) {
            policies.returnPolicyId = rRes.returnPolicies[0].returnPolicyId;
        }
    } catch { /* ignore */ }

    if (!policies.returnPolicyId) {
        try {
            const rp = await ebayApiCall(accessToken, 'POST', '/sell/account/v1/return_policy', {
                name: 'Card Sync Returns',
                marketplaceId: 'EBAY_US',
                returnsAccepted: true,
                returnPeriod: { value: 30, unit: 'DAY' },
                refundMethod: 'MONEY_BACK',
                returnShippingCostPayer: 'BUYER',
            });
            policies.returnPolicyId = rp.returnPolicyId;
        } catch (e) { console.error('Return policy error:', e.message); }
    }

    return policies;
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
    ensureMerchantLocation,
    ensureBusinessPolicies,
    isSandbox,
};
