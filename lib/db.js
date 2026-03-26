/**
 * Shared Database Connection Pool
 * Optimized for serverless environments (Vercel)
 */

const { Pool } = require('pg');

let pool = null;

function getPool() {
    if (!pool) {
        // Strip sslmode from connection string to avoid pg overriding our ssl config
        const connStr = (process.env.DATABASE_URL || '').replace(/[?&]sslmode=[^&]*/g, '');
        pool = new Pool({
            connectionString: connStr,
            ssl: {
                rejectUnauthorized: false
            },
            max: 3,
            min: 0,
            idleTimeoutMillis: 10000,
            connectionTimeoutMillis: 20000,
            allowExitOnIdle: true,
            statement_timeout: 30000,
        });

        pool.on('error', (err) => {
            console.error('Unexpected database pool error:', err);
        });

        pool.on('connect', async (client) => {
            try {
                await client.query("SET timezone = 'UTC'");
            } catch (err) {
                console.error('Failed to set timezone:', err);
            }
        });
    }

    return pool;
}

module.exports = { getPool };
