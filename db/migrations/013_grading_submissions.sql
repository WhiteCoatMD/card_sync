-- Grading submission tracking
CREATE TABLE IF NOT EXISTS grading_submissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    grading_company TEXT NOT NULL,  -- 'PSA', 'BGS', 'CGC', 'SGC'
    service_level TEXT,  -- 'economy', 'regular', 'express', 'super_express', 'walkthrough'
    submission_number TEXT,  -- company's order/submission number
    tracking_number TEXT,  -- outbound shipping tracking
    return_tracking TEXT,  -- return shipping tracking
    status TEXT DEFAULT 'preparing',  -- preparing, shipped, received, grading, graded, returned
    date_submitted TIMESTAMPTZ,
    date_received TIMESTAMPTZ,
    date_completed TIMESTAMPTZ,
    date_returned TIMESTAMPTZ,
    estimated_completion TIMESTAMPTZ,
    total_declared_value DECIMAL(10,2) DEFAULT 0,
    total_cost DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grading_submission_items (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL REFERENCES grading_submissions(id) ON DELETE CASCADE,
    inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
    card_name TEXT NOT NULL,
    cert_number TEXT,
    grade DECIMAL(3,1),
    grade_label TEXT,  -- 'GEM MINT 10', 'MINT 9', etc.
    declared_value DECIMAL(10,2),
    grading_fee DECIMAL(10,2),
    pre_grade_value DECIMAL(10,2),
    post_grade_value DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grading_sub_user ON grading_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_grading_sub_status ON grading_submissions(status);
CREATE INDEX IF NOT EXISTS idx_grading_items_sub ON grading_submission_items(submission_id);
