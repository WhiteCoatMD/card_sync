-- Add shop/storefront fields to users table for subdomain-based dealer stores
ALTER TABLE users ADD COLUMN IF NOT EXISTS subdomain VARCHAR(63) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_description TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_enabled BOOLEAN DEFAULT false;

-- Index for fast subdomain lookups
CREATE INDEX IF NOT EXISTS idx_users_subdomain ON users(subdomain) WHERE subdomain IS NOT NULL;
