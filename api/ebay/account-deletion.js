const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    // eBay verification challenge — they send a challenge_code and we must respond with a hash
    const challengeCode = req.query.challenge_code;
    if (!challengeCode) {
      return res.status(400).json({ error: 'Missing challenge_code' });
    }

    const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;
    const endpoint = 'https://cardsync-lemon.vercel.app/api/ebay/account-deletion';

    const hash = crypto.createHash('sha256');
    hash.update(challengeCode);
    hash.update(verificationToken);
    hash.update(endpoint);
    const responseHash = hash.digest('hex');

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({ challengeResponse: responseHash });
  }

  if (req.method === 'POST') {
    // eBay account deletion notification
    const { metadata, notification } = req.body || {};
    console.log('eBay account deletion notification received:', JSON.stringify(req.body));

    // In production, you would delete/anonymize the user's eBay data here
    // For now, acknowledge receipt
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
