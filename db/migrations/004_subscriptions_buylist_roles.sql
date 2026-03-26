-- Card Sync — Subscriptions, Buylist, User Roles

-- Update users table with plan fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_card_limit INTEGER DEFAULT 250;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'owner';

-- Tie inventory to a user/dealer
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- Tie orders to the dealer (not just the customer)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dealer_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- Team invitations
CREATE TABLE IF NOT EXISTS team_invites (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'employee',
    token VARCHAR(255) UNIQUE NOT NULL,
    accepted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_team_invites_token ON team_invites(token);
CREATE INDEX IF NOT EXISTS idx_team_invites_owner ON team_invites(owner_id);

-- Buylist: customers submit cards they want to sell to the dealer
CREATE TABLE IF NOT EXISTS buylist (
    id SERIAL PRIMARY KEY,
    dealer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',   -- pending, reviewed, accepted, rejected, completed
    total_offer DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_buylist_dealer_id ON buylist(dealer_id);
CREATE INDEX IF NOT EXISTS idx_buylist_status ON buylist(status);

-- Buylist items: individual cards in a buylist submission
CREATE TABLE IF NOT EXISTS buylist_items (
    id SERIAL PRIMARY KEY,
    buylist_id INTEGER REFERENCES buylist(id) ON DELETE CASCADE,
    card_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    set_name VARCHAR(255),
    card_number VARCHAR(50),
    rarity VARCHAR(50),
    condition VARCHAR(50) DEFAULT 'near_mint',
    quantity INTEGER DEFAULT 1,
    asking_price DECIMAL(10,2),             -- what the customer wants
    offer_price DECIMAL(10,2),              -- what the dealer offers
    status VARCHAR(50) DEFAULT 'pending',   -- pending, accepted, rejected
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_buylist_items_buylist_id ON buylist_items(buylist_id);

-- Analytics: daily snapshots for trend tracking
CREATE TABLE IF NOT EXISTS analytics_snapshots (
    id SERIAL PRIMARY KEY,
    dealer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    total_inventory_count INTEGER DEFAULT 0,
    total_inventory_value DECIMAL(12,2) DEFAULT 0,
    total_inventory_cost DECIMAL(12,2) DEFAULT 0,
    total_sales DECIMAL(12,2) DEFAULT 0,
    total_purchases DECIMAL(12,2) DEFAULT 0,
    order_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(dealer_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_dealer_date ON analytics_snapshots(dealer_id, snapshot_date);
