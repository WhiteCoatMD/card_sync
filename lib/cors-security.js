/**
 * Secure CORS Configuration
 */

const ALLOWED_ORIGINS = [
  // Add your production domains here
  ...(process.env.NODE_ENV !== 'production' ? [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000'
  ] : [])
];

function setCorsHeaders(req, res, options = {}) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', options.methods || 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', options.headers || 'X-Requested-With, Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

module.exports = { ALLOWED_ORIGINS, setCorsHeaders };
