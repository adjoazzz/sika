-- Users table. The SMS route and the Telegram bot both look users up by
-- sms_api_key / telegram_chat_id / link_code, but no earlier migration created it.
CREATE TABLE IF NOT EXISTS users (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sms_api_key      TEXT        NOT NULL,
  email            TEXT,
  link_code        TEXT,
  telegram_chat_id TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- In case a users table already exists with a subset of these columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS link_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- payments/webhook.ts relies on ON CONFLICT (sms_api_key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_sms_api_key ON users (sms_api_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_link_code ON users (link_code) WHERE link_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
