/**
 * Card Pricing Library
 * JustTCG — all card types (Pokemon, MTG, Yu-Gi-Oh, Lorcana, One Piece, Digimon)
 * Scryfall — Magic: The Gathering (free, no key needed, images + prices)
 */

const JUSTTCG_BASE = 'https://api.justtcg.com/v1';
const SCRYFALL_BASE = 'https://api.scryfall.com';

// Simple in-memory cache (5 min TTL)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key) {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.time < CACHE_TTL) return entry.data;
    cache.delete(key);
    return null;
}

function setCache(key, data) {
    cache.set(key, { data, time: Date.now() });
    // Evict old entries if cache grows too large
    if (cache.size > 500) {
        const oldest = cache.keys().next().value;
        cache.delete(oldest);
    }
}

// Rate limiter for Scryfall (100ms between requests)
let lastScryfallRequest = 0;
async function scryfallDelay() {
    const now = Date.now();
    const wait = Math.max(0, 100 - (now - lastScryfallRequest));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastScryfallRequest = Date.now();
}

/**
 * Search JustTCG for card pricing
 */
async function searchJustTCG(name, category) {
    const apiKey = process.env.JUSTTCG_API_KEY;
    if (!apiKey) return { source: 'justtcg', error: 'JUSTTCG_API_KEY not configured', results: [] };

    const cacheKey = `justtcg:${category}:${name}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const params = new URLSearchParams({ q: name });

        const res = await fetch(`${JUSTTCG_BASE}/cards?${params}`, {
            headers: {
                'x-api-key': apiKey,
                'Accept': 'application/json',
            },
        });

        if (!res.ok) {
            const text = await res.text();
            return { source: 'justtcg', error: `API error ${res.status}: ${text}`, results: [] };
        }

        const data = await res.json();
        const cards = (data.data || []).map(card => {
            // Extract best price from variants
            const variants = card.variants || [];
            const normalVariant = variants.find(v => v.printingType === 'Normal') || variants[0];
            const foilVariant = variants.find(v => v.printingType === 'Foil');

            return {
                source: 'justtcg',
                name: card.name || '',
                set_name: card.setName || card.set || '',
                card_number: card.number || '',
                rarity: card.rarity || '',
                image_url: card.imageUrl || null,
                market_price: normalVariant?.marketPrice ?? null,
                foil_price: foilVariant?.marketPrice ?? null,
                last_updated: normalVariant?.lastUpdated || null,
                game: card.game || category || '',
            };
        });

        const result = { source: 'justtcg', results: cards };
        setCache(cacheKey, result);
        return result;
    } catch (error) {
        return { source: 'justtcg', error: error.message, results: [] };
    }
}

/**
 * Search Scryfall for Magic: The Gathering cards (free, no API key)
 */
async function searchScryfall(name, setName) {
    const cacheKey = `scryfall:${name}:${setName || ''}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        await scryfallDelay();

        let query = `!"${name}"`;
        if (setName) query += ` set:"${setName}"`;

        const params = new URLSearchParams({ q: query, unique: 'prints' });
        const res = await fetch(`${SCRYFALL_BASE}/cards/search?${params}`, {
            headers: {
                'User-Agent': 'CardSync/1.0',
                'Accept': 'application/json',
            },
        });

        if (!res.ok) {
            if (res.status === 404) return { source: 'scryfall', results: [] };
            return { source: 'scryfall', error: `API error ${res.status}`, results: [] };
        }

        const data = await res.json();
        const cards = (data.data || []).map(card => {
            const imageUris = card.image_uris || (card.card_faces && card.card_faces[0]?.image_uris) || {};
            return {
                source: 'scryfall',
                name: card.name,
                set_name: card.set_name || '',
                card_number: card.collector_number || '',
                rarity: card.rarity || '',
                image_url: imageUris.normal || imageUris.small || null,
                image_small: imageUris.small || null,
                market_price: card.prices?.usd ? parseFloat(card.prices.usd) : null,
                foil_price: card.prices?.usd_foil ? parseFloat(card.prices.usd_foil) : null,
                eur_price: card.prices?.eur ? parseFloat(card.prices.eur) : null,
                scryfall_id: card.id,
                tcgplayer_id: card.tcgplayer_id || null,
            };
        });

        const result = { source: 'scryfall', results: cards };
        setCache(cacheKey, result);
        return result;
    } catch (error) {
        return { source: 'scryfall', error: error.message, results: [] };
    }
}

/**
 * Search for card pricing across all sources.
 * Uses Scryfall for MTG, JustTCG for everything.
 */
async function searchPricing(name, category, setName) {
    const results = [];

    // Always try JustTCG (covers all card types)
    const justTCGResult = await searchJustTCG(name, category);
    if (justTCGResult.results.length > 0) {
        results.push(...justTCGResult.results);
    }

    // For Magic cards, also check Scryfall (free, great images)
    if (!category || category === 'magic') {
        const scryfallResult = await searchScryfall(name, setName);
        if (scryfallResult.results.length > 0) {
            results.push(...scryfallResult.results);
        }
    }

    return {
        query: { name, category, set_name: setName },
        results,
        errors: [
            ...(justTCGResult.error ? [{ source: 'justtcg', error: justTCGResult.error }] : []),
        ],
    };
}

/**
 * Look up market price for a specific inventory item
 */
async function lookupInventoryPrice(item) {
    const result = await searchPricing(item.name, item.category, item.set_name);

    if (result.results.length === 0) {
        return { found: false, item_id: item.id };
    }

    // Find best match by name + set
    let bestMatch = result.results[0];
    for (const r of result.results) {
        const nameMatch = r.name.toLowerCase() === item.name.toLowerCase();
        const setMatch = item.set_name && r.set_name && r.set_name.toLowerCase().includes(item.set_name.toLowerCase());
        if (nameMatch && setMatch) {
            bestMatch = r;
            break;
        }
        if (nameMatch && !bestMatch) {
            bestMatch = r;
        }
    }

    return {
        found: true,
        item_id: item.id,
        market_price: bestMatch.market_price,
        foil_price: bestMatch.foil_price,
        source: bestMatch.source,
        image_url: bestMatch.image_url,
        last_updated: bestMatch.last_updated,
    };
}

module.exports = {
    searchJustTCG,
    searchScryfall,
    searchPricing,
    lookupInventoryPrice,
};
