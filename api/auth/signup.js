/**
 * User Registration API
 */

const { createUser, generateToken } = require('../../lib/auth');
const { setCorsHeaders } = require('../../lib/cors-security');
const { sendEmail } = require('../../lib/email');

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

        // Send welcome email (non-blocking — don't fail signup if email fails)
        try {
            const name = (displayName || 'there').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
            await sendEmail({
                to: email,
                subject: 'Welcome to Card Sync!',
                html: `
                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;background:#1a1a2e;color:#fff;border-radius:12px;overflow:hidden;">
                        <div style="background:#4a90d9;padding:24px 30px;">
                            <h1 style="margin:0;font-size:22px;color:#fff;">Welcome to Card Sync!</h1>
                        </div>
                        <div style="padding:30px;">
                            <p style="color:#ccc;font-size:15px;line-height:1.6;margin:0 0 20px;">
                                Hey ${name}, welcome to the Card Sync community! You're all set to start managing your card inventory and selling across multiple channels. Here's how to get rolling:
                            </p>

                            <div style="margin-bottom:16px;padding:16px;background:#0d0d1a;border-radius:8px;border-left:3px solid #4a90d9;">
                                <strong style="color:#fff;font-size:14px;">Step 1: Add your cards</strong>
                                <p style="color:#aaa;font-size:13px;margin:6px 0 0;line-height:1.5;">Head to Inventory and start adding cards — or import a CSV if you've got a big collection.</p>
                            </div>

                            <div style="margin-bottom:16px;padding:16px;background:#0d0d1a;border-radius:8px;border-left:3px solid #4a90d9;">
                                <strong style="color:#fff;font-size:14px;">Step 2: Set up your store</strong>
                                <p style="color:#aaa;font-size:13px;margin:6px 0 0;line-height:1.5;">Pick a subdomain, choose a theme, and launch your online storefront in minutes.</p>
                            </div>

                            <div style="margin-bottom:24px;padding:16px;background:#0d0d1a;border-radius:8px;border-left:3px solid #4a90d9;">
                                <strong style="color:#fff;font-size:14px;">Step 3: Connect your channels</strong>
                                <p style="color:#aaa;font-size:13px;margin:6px 0 0;line-height:1.5;">Link eBay, Google Sheets, or Facebook to sync your inventory everywhere you sell.</p>
                            </div>

                            <div style="text-align:center;margin:24px 0;">
                                <a href="https://collect-sync.com/quickstart.html" style="display:inline-block;padding:12px 28px;background:#4a90d9;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">See the Full Guide</a>
                            </div>

                            <p style="color:#888;font-size:13px;line-height:1.5;margin:20px 0 0;">
                                Happy selling!<br>
                                <strong style="color:#aaa;">The Card Sync Team</strong>
                            </p>
                        </div>
                    </div>
                `
            });
        } catch (emailErr) {
            console.error('Welcome email failed (non-blocking):', emailErr);
        }

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
