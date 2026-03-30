/**
 * Storefront router — serves store.html for subdomains, _index.html for root domain
 * Uses internal fetch to get the static file from the same deployment
 */

module.exports = async function handler(req, res) {
    const host = (req.headers.host || '').toLowerCase();
    const rootDomains = ['collect-sync.com', 'www.collect-sync.com', 'cardsync-lemon.vercel.app'];

    const isSubdomain = !rootDomains.includes(host) && host.endsWith('.collect-sync.com');
    const file = isSubdomain ? 'store.html' : '_index.html';

    try {
        const proto = req.headers['x-forwarded-proto'] || 'https';
        const response = await fetch(`${proto}://${host}/${file}`);
        const html = await response.text();

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
        return res.status(200).send(html);
    } catch (e) {
        // Fallback redirect
        return res.writeHead(302, { Location: '/' + file }).end();
    }
};
