-- Card Sync — Google Sheets Connections (per dealer)

CREATE TABLE IF NOT EXISTS sheet_connections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    sheet_id VARCHAR(255) NOT NULL,         -- Google Sheet ID from URL
    sheet_name VARCHAR(255),                -- Friendly name
    tab_name VARCHAR(255) DEFAULT 'Sheet1', -- Which tab to sync
    sync_enabled BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMP,
    last_sync_status VARCHAR(50),           -- success, error
    last_sync_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, sheet_id)
);

CREATE INDEX IF NOT EXISTS idx_sheet_connections_user_id ON sheet_connections(user_id);
