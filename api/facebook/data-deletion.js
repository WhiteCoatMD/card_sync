// Facebook Data Deletion Callback
// Meta requires this endpoint to handle user data deletion requests
// See: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback

const crypto = require('crypto');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { signed_request } = req.body;

        if (!signed_request) {
            return res.status(400).json({ error: 'Missing signed_request' });
        }

        // Parse the signed request
        const [encodedSig, payload] = signed_request.split('.');
        const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
        const userId = data.user_id;

        // Generate a confirmation code
        const confirmationCode = crypto.randomBytes(16).toString('hex');

        // Return the required response format
        // Meta expects a JSON response with a URL where the user can check deletion status
        // and a confirmation code
        res.status(200).json({
            url: `https://collect-sync.com/privacy.html`,
            confirmation_code: confirmationCode
        });
    } catch (err) {
        console.error('Facebook data deletion error:', err);
        res.status(200).json({
            url: `https://collect-sync.com/privacy.html`,
            confirmation_code: 'error'
        });
    }
};
