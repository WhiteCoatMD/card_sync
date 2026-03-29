-- Low stock alert settings on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5;
ALTER TABLE users ADD COLUMN IF NOT EXISTS low_stock_alerts_enabled BOOLEAN DEFAULT false;

-- Low stock alerts table
CREATE TABLE IF NOT EXISTS low_stock_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    card_name TEXT NOT NULL,
    current_quantity INTEGER NOT NULL,
    threshold INTEGER NOT NULL,
    email_sent_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_low_stock_user ON low_stock_alerts(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_low_stock_unique ON low_stock_alerts(user_id, inventory_id)
    WHERE acknowledged_at IS NULL;
