/**
 * Facebook Migration — create facebook_connections and facebook_posts tables
 * POST /api/facebook/migrate
 * Admin only, one-time setup
 */

const { requireAuth } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { getPool } = require('../../lib/db');

module.exports = requireAuth(async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    if (!req.user.is_admin) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const pool = getPool();

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS facebook_connections (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
                access_token TEXT,
                page_access_token TEXT,
                page_id VARCHAR(255),
                page_name VARCHAR(255),
                token_expires_at TIMESTAMP,
                sync_enabled BOOLEAN DEFAULT true,
                auto_post_new BOOLEAN DEFAULT false,
                auto_post_price_drop BOOLEAN DEFAULT false,
                post_schedule VARCHAR(50) DEFAULT NULL,
                schedule_time TIME DEFAULT '18:00',
                last_posted_at TIMESTAMP,
                last_post_status VARCHAR(50),
                last_post_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS facebook_posts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                inventory_id INTEGER REFERENCES inventory(id) ON DELETE CASCADE,
                facebook_post_id VARCHAR(255),
                page_id VARCHAR(255),
                posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                post_type VARCHAR(50) DEFAULT 'manual'
            )
        `);

        return res.status(200).json({
            success: true,
            message: 'facebook_connections and facebook_posts tables created successfully'
        });
    } catch (err) {
        console.error('Facebook migration error:', err);
        return res.status(500).json({ success: false, error: 'Migration failed: ' + err.message });
    }
});
