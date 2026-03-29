/**
 * Subdomain detection for dealer storefronts
 * Extracts subdomain from request hostname and looks up the dealer
 */

const { getPool } = require('./db');
const { retryQuery } = require('./db-retry');

const ROOT_DOMAINS = ['collect-sync.com', 'cardsync-lemon.vercel.app', 'localhost'];

/**
 * Extract subdomain from hostname
 * e.g. "cardkinghq.collect-sync.com" => "cardkinghq"
 * e.g. "collect-sync.com" => null
 */
function extractSubdomain(hostname) {
    if (!hostname) return null;

    // Strip port
    const host = hostname.split(':')[0].toLowerCase();

    // Check each root domain
    for (const root of ROOT_DOMAINS) {
        if (host === root) return null; // root domain, no subdomain
        if (host.endsWith('.' + root)) {
            const sub = host.slice(0, -(root.length + 1));
            // Only single-level subdomains (no dots)
            if (sub && !sub.includes('.') && sub !== 'www' && sub !== 'api') {
                return sub;
            }
            return null;
        }
    }

    return null;
}

/**
 * Look up dealer by subdomain
 * Returns dealer info or null
 */
async function getDealerBySubdomain(subdomain) {
    if (!subdomain) return null;

    const pool = getPool();
    const result = await retryQuery(
        () => pool.query(
            `SELECT id, email, display_name, subdomain, shop_name, shop_description, shop_enabled
             FROM users WHERE subdomain = $1 AND shop_enabled = true`,
            [subdomain]
        ),
        'Subdomain lookup'
    );

    return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Validate a subdomain string
 * - 3-63 chars, lowercase alphanumeric + hyphens
 * - Can't start/end with hyphen
 * - No reserved words
 */
function validateSubdomain(subdomain) {
    if (!subdomain || typeof subdomain !== 'string') return 'Subdomain is required';

    const s = subdomain.toLowerCase().trim();
    if (s.length < 3) return 'Subdomain must be at least 3 characters';
    if (s.length > 63) return 'Subdomain must be 63 characters or less';
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s)) return 'Subdomain can only contain lowercase letters, numbers, and hyphens';

    const reserved = ['www', 'api', 'app', 'admin', 'mail', 'ftp', 'blog', 'shop', 'store', 'help', 'support', 'status', 'docs', 'dev', 'staging', 'test'];
    if (reserved.includes(s)) return 'That subdomain is reserved';

    return null;
}

module.exports = { extractSubdomain, getDealerBySubdomain, validateSubdomain, ROOT_DOMAINS };
