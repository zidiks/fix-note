-- Recurring Telegram Stars subscriptions + 5-day trial

-- 1) Trial defaults: 5 days (was 7 days)
ALTER TABLE users
    ALTER COLUMN subscription_expires_at SET DEFAULT (NOW() + INTERVAL '5 days'),
    ALTER COLUMN trial_ends_at SET DEFAULT (NOW() + INTERVAL '5 days');

-- Normalize active trial users to max 5-day window from trial start.
UPDATE users
SET trial_ends_at = COALESCE(trial_started_at, NOW()) + INTERVAL '5 days'
WHERE subscription_plan = 'trial'
  AND (
      trial_ends_at IS NULL
      OR trial_ends_at > (COALESCE(trial_started_at, NOW()) + INTERVAL '5 days')
  );

UPDATE users
SET subscription_expires_at = trial_ends_at
WHERE subscription_plan = 'trial'
  AND (
      subscription_expires_at IS NULL
      OR subscription_expires_at > trial_ends_at
  );

-- 2) Store recurring-payment metadata
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS invoice_payload VARCHAR(255),
    ADD COLUMN IF NOT EXISTS subscription_period INTEGER,
    ADD COLUMN IF NOT EXISTS subscription_expiration_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_first_recurring BOOLEAN DEFAULT FALSE;

-- Idempotency for payment updates
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_telegram_charge_unique
    ON payments (telegram_payment_charge_id)
    WHERE telegram_payment_charge_id IS NOT NULL;
