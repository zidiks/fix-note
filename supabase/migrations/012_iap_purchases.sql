-- Migration 012: Create iap_purchases table for Apple IAP and Google Play Billing

CREATE TABLE IF NOT EXISTS iap_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('apple', 'google')),
    product_id TEXT NOT NULL,
    transaction_id TEXT,
    purchase_token TEXT,
    plan TEXT NOT NULL,
    billing_period TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate receipts
CREATE UNIQUE INDEX IF NOT EXISTS idx_iap_purchases_transaction_id
    ON iap_purchases (transaction_id) WHERE transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_iap_purchases_purchase_token
    ON iap_purchases (purchase_token) WHERE purchase_token IS NOT NULL;

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_iap_purchases_user_id ON iap_purchases (user_id);
CREATE INDEX IF NOT EXISTS idx_iap_purchases_created_at ON iap_purchases (created_at DESC);
