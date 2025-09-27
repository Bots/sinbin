-- SinBin Database Schema
-- Version 1.0

-- Table for individual penalty records
CREATE TABLE IF NOT EXISTS penalties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('mic', 'chat')),
    username TEXT, -- null for mic, username for chat
    confidence REAL,
    session_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Table for chat user tracking
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    penalty_count INTEGER DEFAULT 0,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_penalty DATETIME,
    total_messages INTEGER DEFAULT 0
);

-- Table for streaming sessions
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    total_penalties INTEGER DEFAULT 0,
    mic_penalties INTEGER DEFAULT 0,
    chat_penalties INTEGER DEFAULT 0,
    clean_streak_best INTEGER DEFAULT 0, -- longest clean period in minutes
    active BOOLEAN DEFAULT 1
);

-- Table for application settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table for penalty thresholds
CREATE TABLE IF NOT EXISTS thresholds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    count INTEGER NOT NULL,
    color TEXT NOT NULL,
    sound_file TEXT,
    active BOOLEAN DEFAULT 1
);

-- Table for goals
CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('daily', 'session', 'weekly')),
    target_count INTEGER NOT NULL,
    target_type TEXT DEFAULT 'under' CHECK (target_type IN ('under', 'exact', 'over')),
    start_date DATE,
    end_date DATE,
    achieved BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_penalties_timestamp ON penalties(timestamp);
CREATE INDEX IF NOT EXISTS idx_penalties_source ON penalties(source);
CREATE INDEX IF NOT EXISTS idx_penalties_session ON penalties(session_id);
CREATE INDEX IF NOT EXISTS idx_users_penalty_count ON users(penalty_count);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(active);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('db_version', '1.0'),
    ('auto_reset_enabled', 'false'),
    ('auto_reset_duration', '30'),
    ('chat_enabled', 'false'),
    ('chat_channel', ''),
    ('firebot_enabled', 'false'),
    ('firebot_endpoint', ''),
    ('animations_enabled', 'true'),
    ('bin_shake_intensity', '5'),
    ('lid_tip_duration', '500'),
    ('goal_daily_target', '0'),
    ('goal_session_target', '0'),
    ('hotkeys_enabled', 'false');

-- Insert default thresholds
INSERT OR IGNORE INTO thresholds (name, count, color, active) VALUES
    ('Safe', 0, '#10b981', 1),
    ('Warning', 5, '#f59e0b', 1),
    ('Danger', 10, '#ef4444', 1);