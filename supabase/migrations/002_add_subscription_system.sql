-- Subscription system migration
-- Add subscription fields to users table

-- Subscription plan enum type
DO $$ BEGIN
    CREATE TYPE subscription_plan AS ENUM ('free', 'trial', 'pro', 'ultra');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add subscription columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_plan subscription_plan DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days');

-- Usage tracking table
CREATE TABLE IF NOT EXISTS usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Monthly counters (reset monthly)
    month_start DATE NOT NULL DEFAULT DATE_TRUNC('month', NOW()),
    
    -- AI Summary usage
    summaries_used INTEGER DEFAULT 0,
    
    -- Voice minutes usage (in seconds for precision)
    voice_seconds_used INTEGER DEFAULT 0,
    
    -- AI Chat messages
    chat_messages_used INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, month_start)
);

-- Payments/transactions table for Telegram Stars
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Telegram payment data
    telegram_payment_charge_id VARCHAR(255),
    provider_payment_charge_id VARCHAR(255),
    
    -- Payment details
    amount INTEGER NOT NULL,
    currency VARCHAR(10) DEFAULT 'XTR', -- XTR = Telegram Stars
    
    -- What was purchased
    plan subscription_plan NOT NULL,
    billing_period VARCHAR(20) NOT NULL, -- 'monthly' or 'yearly'
    
    -- Status
    status VARCHAR(20) DEFAULT 'completed', -- 'pending', 'completed', 'refunded', 'failed'
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscription plan limits (reference table)
CREATE TABLE IF NOT EXISTS subscription_limits (
    plan subscription_plan PRIMARY KEY,
    summaries_per_month INTEGER,
    voice_minutes_per_month INTEGER,
    ai_chat_enabled BOOLEAN DEFAULT false,
    ai_chat_fast BOOLEAN DEFAULT false,
    sync_enabled BOOLEAN DEFAULT false,
    auto_sync BOOLEAN DEFAULT false,
    price_monthly_stars INTEGER,
    price_yearly_stars INTEGER
);

-- Insert plan limits
INSERT INTO subscription_limits (plan, summaries_per_month, voice_minutes_per_month, ai_chat_enabled, ai_chat_fast, sync_enabled, auto_sync, price_monthly_stars, price_yearly_stars)
VALUES 
    ('free', 0, 0, false, false, false, false, 0, 0),
    ('trial', 800, 720, true, true, true, true, 0, 0),
    ('pro', 200, 180, true, false, true, false, 350, 3500),
    ('ultra', 800, 720, true, true, true, true, 800, 8000)
ON CONFLICT (plan) DO UPDATE SET
    summaries_per_month = EXCLUDED.summaries_per_month,
    voice_minutes_per_month = EXCLUDED.voice_minutes_per_month,
    ai_chat_enabled = EXCLUDED.ai_chat_enabled,
    ai_chat_fast = EXCLUDED.ai_chat_fast,
    sync_enabled = EXCLUDED.sync_enabled,
    auto_sync = EXCLUDED.auto_sync,
    price_monthly_stars = EXCLUDED.price_monthly_stars,
    price_yearly_stars = EXCLUDED.price_yearly_stars;

-- Index for usage stats lookups
CREATE INDEX IF NOT EXISTS idx_usage_stats_user_month ON usage_stats(user_id, month_start);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

-- RLS Policies for new tables
ALTER TABLE usage_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_limits ENABLE ROW LEVEL SECURITY;

-- Policies for usage_stats
DROP POLICY IF EXISTS "Users can view own usage" ON usage_stats;
CREATE POLICY "Users can view own usage" ON usage_stats FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own usage" ON usage_stats;
CREATE POLICY "Users can insert own usage" ON usage_stats FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own usage" ON usage_stats;
CREATE POLICY "Users can update own usage" ON usage_stats FOR UPDATE USING (true);

-- Policies for payments
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
CREATE POLICY "Users can view own payments" ON payments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert payments" ON payments;
CREATE POLICY "Users can insert payments" ON payments FOR INSERT WITH CHECK (true);

-- Policies for subscription_limits (read-only for all)
DROP POLICY IF EXISTS "Anyone can view limits" ON subscription_limits;
CREATE POLICY "Anyone can view limits" ON subscription_limits FOR SELECT USING (true);

-- Function to get or create current month usage
CREATE OR REPLACE FUNCTION get_or_create_monthly_usage(p_user_id UUID)
RETURNS usage_stats
LANGUAGE plpgsql
AS $$
DECLARE
    v_month_start DATE := DATE_TRUNC('month', NOW())::DATE;
    v_usage usage_stats;
BEGIN
    -- Try to get existing record
    SELECT * INTO v_usage FROM usage_stats
    WHERE user_id = p_user_id AND month_start = v_month_start;
    
    -- Create if not exists
    IF v_usage IS NULL THEN
        INSERT INTO usage_stats (user_id, month_start)
        VALUES (p_user_id, v_month_start)
        RETURNING * INTO v_usage;
    END IF;
    
    RETURN v_usage;
END;
$$;

-- Function to check if user can use feature
CREATE OR REPLACE FUNCTION can_use_feature(
    p_user_id UUID,
    p_feature VARCHAR -- 'summary', 'voice', 'chat'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_user users;
    v_limits subscription_limits;
    v_usage usage_stats;
BEGIN
    -- Get user
    SELECT * INTO v_user FROM users WHERE id = p_user_id;
    IF v_user IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check if trial expired
    IF v_user.subscription_plan = 'trial' AND v_user.trial_ends_at < NOW() THEN
        -- Update user to free plan
        UPDATE users SET subscription_plan = 'free' WHERE id = p_user_id;
        v_user.subscription_plan := 'free';
    END IF;
    
    -- Check if subscription expired (for paid plans)
    IF v_user.subscription_plan IN ('pro', 'ultra') AND v_user.subscription_expires_at < NOW() THEN
        UPDATE users SET subscription_plan = 'free' WHERE id = p_user_id;
        v_user.subscription_plan := 'free';
    END IF;
    
    -- Get limits for plan
    SELECT * INTO v_limits FROM subscription_limits WHERE plan = v_user.subscription_plan;
    
    -- Get current usage
    v_usage := get_or_create_monthly_usage(p_user_id);
    
    -- Check feature
    CASE p_feature
        WHEN 'summary' THEN
            IF v_limits.summaries_per_month IS NULL THEN
                RETURN TRUE; -- Unlimited
            END IF;
            RETURN v_usage.summaries_used < v_limits.summaries_per_month;
        WHEN 'voice' THEN
            IF v_limits.voice_minutes_per_month IS NULL THEN
                RETURN TRUE;
            END IF;
            RETURN (v_usage.voice_seconds_used / 60) < v_limits.voice_minutes_per_month;
        WHEN 'chat' THEN
            RETURN v_limits.ai_chat_enabled;
        ELSE
            RETURN FALSE;
    END CASE;
END;
$$;

-- Trigger to update usage_stats updated_at
DROP TRIGGER IF EXISTS update_usage_stats_updated_at ON usage_stats;
CREATE TRIGGER update_usage_stats_updated_at
    BEFORE UPDATE ON usage_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

