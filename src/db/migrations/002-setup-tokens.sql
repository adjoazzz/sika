-- One-time setup tokens used to deliver pre-filled .shortcut files
-- Each token is tied to one user's smsApiKey + serverUrl pair.
-- Once used (used_at IS NOT NULL) the link is dead — it cannot be replayed.
CREATE TABLE IF NOT EXISTS setup_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token        VARCHAR(64) NOT NULL UNIQUE,
  sms_api_key  TEXT        NOT NULL,
  server_url   TEXT        NOT NULL,
  used_at      TIMESTAMPTZ,                         -- NULL until consumed
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_setup_tokens_token ON setup_tokens (token);
