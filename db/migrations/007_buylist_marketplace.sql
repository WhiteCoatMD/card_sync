-- Add marketplace mode to buylist
-- type: 'direct' = sent to specific dealer (existing), 'marketplace' = open for any dealer to bid
ALTER TABLE buylist ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'direct';
ALTER TABLE buylist ALTER COLUMN dealer_id DROP NOT NULL;

-- Track which submission the seller is viewing offers on
ALTER TABLE buylist ADD COLUMN IF NOT EXISTS seller_token VARCHAR(64);

-- Dealer offers on marketplace buylist submissions
CREATE TABLE IF NOT EXISTS buylist_offers (
    id SERIAL PRIMARY KEY,
    buylist_id INTEGER NOT NULL REFERENCES buylist(id) ON DELETE CASCADE,
    dealer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_offer DECIMAL(10,2) NOT NULL,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'pending',  -- pending, accepted, rejected, withdrawn
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(buylist_id, dealer_id)  -- one offer per dealer per submission
);

-- Offer items — per-card breakdown of a dealer's offer
CREATE TABLE IF NOT EXISTS buylist_offer_items (
    id SERIAL PRIMARY KEY,
    offer_id INTEGER NOT NULL REFERENCES buylist_offers(id) ON DELETE CASCADE,
    buylist_item_id INTEGER NOT NULL REFERENCES buylist_items(id) ON DELETE CASCADE,
    offer_price DECIMAL(10,2),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buylist_type ON buylist(type);
CREATE INDEX IF NOT EXISTS idx_buylist_seller_token ON buylist(seller_token) WHERE seller_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_buylist_offers_buylist_id ON buylist_offers(buylist_id);
CREATE INDEX IF NOT EXISTS idx_buylist_offers_dealer_id ON buylist_offers(dealer_id);
CREATE INDEX IF NOT EXISTS idx_buylist_offer_items_offer_id ON buylist_offer_items(offer_id);
