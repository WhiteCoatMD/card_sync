-- eBay auto-relist support
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS ebay_listing_status TEXT DEFAULT 'active';
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS ebay_listing_ended_at TIMESTAMPTZ;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS ebay_auto_relist BOOLEAN DEFAULT true;

-- Relist log
CREATE TABLE IF NOT EXISTS ebay_relist_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    inventory_id INTEGER REFERENCES inventory(id) ON DELETE CASCADE,
    old_listing_id TEXT,
    new_listing_id TEXT,
    status TEXT NOT NULL,  -- 'success', 'failed'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relist_log_user ON ebay_relist_log(user_id);
CREATE INDEX IF NOT EXISTS idx_relist_log_created ON ebay_relist_log(created_at);

-- Track last relist check per dealer
ALTER TABLE ebay_connections ADD COLUMN IF NOT EXISTS last_relist_check_at TIMESTAMPTZ;
ALTER TABLE ebay_connections ADD COLUMN IF NOT EXISTS auto_relist_enabled BOOLEAN DEFAULT true;
