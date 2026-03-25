/**
 * Authentication Utilities
 * Handles password hashing, JWT tokens, and user verification
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool } = require('./db');
const { retryQuery } = require('./db-retry');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('CRITICAL: JWT_SECRET environment variable must be set.');
}
const TOKEN_EXPIRY = '365d';

const pool = getPool();

async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
}

async function comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

function generateToken(userId, email) {
    return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

async function createUser(email, password, displayName = null) {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
        throw new Error('User already exists');
    }

    const passwordHash = await hashPassword(password);

    const result = await pool.query(
        `INSERT INTO users (email, password_hash, display_name, subscription_status)
         VALUES ($1, $2, $3, 'trial')
         RETURNING id, email, display_name, created_at, subscription_status`,
        [email, passwordHash, displayName]
    );

    return result.rows[0];
}

async function authenticateUser(email, password) {
    const result = await retryQuery(
        () => pool.query(
            'SELECT id, email, password_hash, display_name, is_admin FROM users WHERE email = $1',
            [email]
        ),
        'Auth - Login'
    );

    if (result.rows.length === 0) {
        throw new Error('Invalid email or password');
    }

    const user = result.rows[0];
    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
        throw new Error('Invalid email or password');
    }

    const token = generateToken(user.id, user.email);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 365);

    await retryQuery(
        () => pool.query(
            'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, token, expiresAt]
        ),
        'Auth - Create Session'
    );

    return {
        user: {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            isAdmin: user.is_admin
        },
        token
    };
}

async function getUserFromToken(token) {
    try {
        const decoded = verifyToken(token);
        if (!decoded) return null;

        const result = await retryQuery(
            () => pool.query(
                `SELECT s.user_id, s.expires_at, u.email, u.display_name, u.is_admin, u.subscription_status
                 FROM sessions s
                 JOIN users u ON s.user_id = u.id
                 WHERE s.token = $1 AND s.expires_at > NOW()`,
                [token]
            ),
            'Get User From Token'
        );

        if (result.rows.length === 0) return null;

        const session = result.rows[0];
        return {
            id: session.user_id,
            email: session.email,
            displayName: session.display_name,
            is_admin: session.is_admin,
            subscription_status: session.subscription_status
        };
    } catch (error) {
        return null;
    }
}

function requireAuth(handler) {
    return async (req, res) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ success: false, error: 'Authentication required' });
            }

            const token = authHeader.substring(7);
            const user = await getUserFromToken(token);

            if (!user) {
                return res.status(401).json({ success: false, error: 'Invalid or expired token' });
            }

            req.user = user;

            // Block expired subscriptions (allow auth + subscription endpoints)
            const blockedStatuses = ['expired', 'cancelled', 'past_due'];
            if (user.subscription_status && blockedStatuses.includes(user.subscription_status)) {
                const url = req.url || '';
                const allowedPaths = ['/api/subscription/', '/api/auth/'];
                const isAllowed = allowedPaths.some(p => url.includes(p));
                if (!isAllowed) {
                    return res.status(403).json({
                        success: false,
                        error: 'Subscription expired',
                        subscriptionExpired: true
                    });
                }
            }

            // Auto-extend session
            try {
                const newExpiresAt = new Date();
                newExpiresAt.setDate(newExpiresAt.getDate() + 365);
                await pool.query('UPDATE sessions SET expires_at = $1 WHERE token = $2', [newExpiresAt, token]);
            } catch (e) { /* don't fail request */ }

            return handler(req, res);
        } catch (error) {
            return res.status(500).json({ success: false, error: 'Authentication error' });
        }
    };
}

function getEffectiveUserId(user) {
    return user.parent_user_id || user.id;
}

module.exports = {
    hashPassword,
    comparePassword,
    generateToken,
    verifyToken,
    createUser,
    authenticateUser,
    getUserFromToken,
    requireAuth,
    getEffectiveUserId
};
