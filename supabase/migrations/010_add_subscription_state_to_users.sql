-- Store current subscription billing/cancellation state on users

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS subscription_billing_period VARCHAR(20),
    ADD COLUMN IF NOT EXISTS subscription_is_recurring BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS subscription_is_canceled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS subscription_canceled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS subscription_telegram_payment_charge_id VARCHAR(255);

-- Normalize null booleans for older rows
UPDATE users
SET
    subscription_is_recurring = COALESCE(subscription_is_recurring, FALSE),
    subscription_is_canceled = COALESCE(subscription_is_canceled, FALSE)
WHERE subscription_is_recurring IS NULL OR subscription_is_canceled IS NULL;
