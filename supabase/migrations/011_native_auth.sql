-- Migration 011: Add native app auth fields to users table
-- Supports Apple Sign In, Google Sign In alongside Telegram

-- Make telegram_id nullable (native users may not have a Telegram account)
ALTER TABLE users ALTER COLUMN telegram_id DROP NOT NULL;

-- Add new auth provider columns
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS apple_id TEXT,
    ADD COLUMN IF NOT EXISTS google_id TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'telegram';

-- Unique constraints
ALTER TABLE users ADD CONSTRAINT users_apple_id_unique UNIQUE (apple_id);
ALTER TABLE users ADD CONSTRAINT users_google_id_unique UNIQUE (google_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_users_apple_id ON users (apple_id) WHERE apple_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users (telegram_id) WHERE telegram_id IS NOT NULL;
