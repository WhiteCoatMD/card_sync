-- Store market price on inventory items when looked up
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS market_price DECIMAL(10,2);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS market_price_updated_at TIMESTAMP;
