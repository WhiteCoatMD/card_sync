-- TCGplayer seller integration
CREATE TABLE IF NOT EXISTS tcgplayer_connections (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    api_key TEXT,
    seller_key TEXT,
    store_name VARCHAR(255),
    sync_enabled BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMPTZ,
    last_sync_status VARCHAR(50),
    last_sync_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TCGplayer listing tracking on inventory
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS tcgplayer_product_id TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS tcgplayer_sku TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS tcgplayer_listing_id TEXT;
