-- Durable "notify me about this transaction" queue.
-- Previously this was an in-memory setTimeout, so a restart inside the 2 minute
-- window silently dropped the Telegram message.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notify_chat_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'transactions' AND column_name = 'notified_at'
  ) THEN
    ALTER TABLE transactions ADD COLUMN notified_at TIMESTAMPTZ;
    -- Existing rows were already handled by the old setTimeout flow
    UPDATE transactions SET notified_at = NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_pending_notify
  ON transactions (created_at) WHERE notified_at IS NULL;
