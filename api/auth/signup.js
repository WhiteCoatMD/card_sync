/**
 * User Registration API
 */

const { createUser, generateToken } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res, { methods: 'POST, OPTIONS', headers: 'Content-Type' });

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { email, password, displayName } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }

        const user = await createUser(email, password, displayName);
        const token = generateToken(user.id, user.email);

        return res.status(201).json({
            success: true,
            message: 'Account created successfully',
            user: { id: user.id, email: user.email, displayName: user.display_name },
            token
        });
    } catch (error) {
        if (error.message === 'User already exists') {
            return res.status(409).json({ success: false, error: 'User already exists' });
        }
        console.error('Signup error:', error);
        return res.status(500).json({ success: false, error: 'Registration failed' });
    }
};
