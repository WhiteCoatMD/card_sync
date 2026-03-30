/**
 * Storefront router — serves store.html for subdomains, index for root domain
 * This exists because Vercel can't do host-based rewrites for static HTML projects
 */
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
    const host = (req.headers.host || '').toLowerCase();
    const rootDomains = ['collect-sync.com', 'www.collect-sync.com', 'cardsync-lemon.vercel.app'];

    let file;
    if (!rootDomains.includes(host) && host.endsWith('.collect-sync.com')) {
        file = 'store.html';
    } else {
        file = '_index.html';
    }

    try {
        const html = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
        return res.status(200).send(html);
    } catch (e) {
        return res.status(500).send('Page not found');
    }
};
