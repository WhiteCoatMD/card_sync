-- Card Sync — eBay Connections (per dealer)

CREATE TABLE IF NOT EXISTS ebay_connections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,
    ebay_username VARCHAR(255),
    marketplace_id VARCHAR(50) DEFAULT 'EBAY_US',
    sync_enabled BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMP,
    last_sync_status VARCHAR(50),
    last_sync_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Track which inventory items are listed on eBay
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS ebay_listing_id VARCHAR(255);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS ebay_offer_id VARCHAR(255);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS ebay_sku VARCHAR(255);
