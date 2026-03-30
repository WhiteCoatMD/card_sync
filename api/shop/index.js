/**
 * Shop Settings API
 * GET  /api/shop — get current shop settings
 * PUT  /api/shop — update shop settings (subdomain, name, description, enabled)
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');
const { retryQuery } = require('../../lib/db-retry');
const { validateSubdomain } = require('../../lib/subdomain');

const pool = getPool();

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        const result = await retryQuery(
            () => pool.query(
                'SELECT subdomain, shop_name, shop_description, shop_enabled, shop_theme, shop_accent_color FROM users WHERE id = $1',
                [req.user.id]
            ),
            'Shop - Get'
        );
        const shop = result.rows[0] || {};
        return res.status(200).json({
            success: true,
            shop: {
                subdomain: shop.subdomain || '',
                shop_name: shop.shop_name || '',
                shop_description: shop.shop_description || '',
                shop_enabled: shop.shop_enabled || false,
                shop_theme: shop.shop_theme || 'midnight',
                shop_accent_color: shop.shop_accent_color || '',
            }
        });
    }

    if (req.method === 'PUT') {
        const { subdomain, shop_name, shop_description, shop_enabled, shop_theme, shop_accent_color } = req.body;

        if (subdomain) {
            const error = validateSubdomain(subdomain);
            if (error) return res.status(400).json({ success: false, error });

            const existing = await retryQuery(
                () => pool.query(
                    'SELECT id FROM users WHERE subdomain = $1 AND id != $2',
                    [subdomain.toLowerCase(), req.user.id]
                ),
                'Shop - Check subdomain'
            );
            if (existing.rows.length > 0) {
                return res.status(409).json({ success: false, error: 'That subdomain is already taken' });
            }
        }

        await retryQuery(
            () => pool.query(
                `UPDATE users SET
                    subdomain = $1,
                    shop_name = $2,
                    shop_description = $3,
                    shop_enabled = $4,
                    shop_theme = $5,
                    shop_accent_color = $6,
                    updated_at = NOW()
                 WHERE id = $7`,
                [
                    subdomain ? subdomain.toLowerCase().trim() : null,
                    shop_name || null,
                    shop_description || null,
                    shop_enabled === true,
                    shop_theme || 'midnight',
                    shop_accent_color || null,
                    req.user.id,
                ]
            ),
            'Shop - Update'
        );

        return res.status(200).json({ success: true, message: 'Shop settings updated' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
});
