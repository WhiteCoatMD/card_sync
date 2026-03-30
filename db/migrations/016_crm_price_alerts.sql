-- Customer CRM
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    dealer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    notes TEXT,
    total_spent DECIMAL(10,2) DEFAULT 0,
    order_count INTEGER DEFAULT 0,
    last_order_at TIMESTAMPTZ,
    tags TEXT,  -- comma-separated: 'vip', 'wholesale', 'collector', etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_dealer ON customers(dealer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_dealer_email ON customers(dealer_id, email) WHERE email IS NOT NULL;

-- Price alerts
CREATE TABLE IF NOT EXISTS price_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    inventory_id INTEGER REFERENCES inventory(id) ON DELETE CASCADE,
    card_name TEXT NOT NULL,
    category VARCHAR(100),
    direction VARCHAR(10) NOT NULL,  -- 'above' or 'below'
    target_price DECIMAL(10,2) NOT NULL,
    last_checked_price DECIMAL(10,2),
    triggered BOOLEAN DEFAULT false,
    triggered_at TIMESTAMPTZ,
    triggered_price DECIMAL(10,2),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON price_alerts(user_id) WHERE active = true AND triggered = false;
