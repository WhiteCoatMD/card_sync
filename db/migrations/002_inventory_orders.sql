-- Card Sync — Inventory & Orders Schema

-- Inventory: cards the business has in stock
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    category VARCHAR(100) NOT NULL,         -- e.g. 'pokemon', 'magic', 'sports', 'yugioh'
    name VARCHAR(255) NOT NULL,
    set_name VARCHAR(255),
    card_number VARCHAR(50),
    rarity VARCHAR(50),
    condition VARCHAR(50) DEFAULT 'near_mint', -- mint, near_mint, lightly_played, moderately_played, heavily_played, damaged
    quantity INTEGER DEFAULT 1,
    buy_price DECIMAL(10,2),                -- what the business paid
    sell_price DECIMAL(10,2),               -- listed sale price
    image_url TEXT,
    description TEXT,
    status VARCHAR(50) DEFAULT 'available', -- available, sold, reserved, unlisted
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);

-- Orders: buy/sell transactions
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    customer_name VARCHAR(255),             -- for walk-in / non-registered customers
    type VARCHAR(10) NOT NULL,              -- 'buy' (business buys from customer) or 'sell' (business sells to customer)
    status VARCHAR(50) DEFAULT 'pending',   -- pending, completed, cancelled
    total_amount DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(type);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Order Items: individual cards in an order
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_inventory_id ON order_items(inventory_id);
