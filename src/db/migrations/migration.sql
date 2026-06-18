-- Pending reminders table
-- Used to persist scheduled reminders across Railway restarts
CREATE TABLE IF NOT EXISTS pending_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,               -- e.g. 'setup_nudge'
  chat_id TEXT NOT NULL,
  send_after TIMESTAMPTZ NOT NULL,          -- when to fire
  sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_reminders_unsent
  ON pending_reminders (send_after)
  WHERE sent = FALSE;