/**
 * User Login API
 */

const { authenticateUser } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { loginRateLimiter } = require('../../lib/ip-rate-limiter');

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res, { methods: 'POST, OPTIONS', headers: 'Content-Type' });

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const rateLimit = loginRateLimiter.check(req);
    if (!rateLimit.allowed) {
        return res.status(429).json({ success: false, error: 'Too many login attempts. Please try again later.' });
    }

    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required' });
        }

        const { user, token } = await authenticateUser(email, password);
        return res.status(200).json({ success: true, user, token });
    } catch (error) {
        if (error.message === 'Invalid email or password') {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }
        return res.status(500).json({ success: false, error: 'Login failed' });
    }
};
