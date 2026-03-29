-- Shipping labels
CREATE TABLE IF NOT EXISTS shipments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    easypost_shipment_id TEXT,
    easypost_tracker_id TEXT,
    tracking_number TEXT,
    carrier TEXT,
    service TEXT,
    rate_amount DECIMAL(10,2),
    label_url TEXT,
    status TEXT DEFAULT 'created',  -- created, purchased, in_transit, delivered
    to_name TEXT,
    to_street1 TEXT,
    to_street2 TEXT,
    to_city TEXT,
    to_state TEXT,
    to_zip TEXT,
    weight_oz DECIMAL(6,2) DEFAULT 3.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order shipping fields
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_tracking TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_carrier TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_label_url TEXT;

-- Dealer return address
ALTER TABLE users ADD COLUMN IF NOT EXISTS ship_from_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ship_from_street1 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ship_from_city TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ship_from_state TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ship_from_zip TEXT;

CREATE INDEX IF NOT EXISTS idx_shipments_user ON shipments(user_id);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);
