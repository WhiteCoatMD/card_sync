-- Switch from per-dealer Stripe keys to Stripe Connect
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_stripe_connect ON users(stripe_connect_account_id) WHERE stripe_connect_account_id IS NOT NULL;
