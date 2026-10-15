import { query } from '../db/client.js';
import { notifyNewTransaction } from './notifications.js';

const POLL_INTERVAL_MS = 30 * 1000;
// Wait a couple of minutes so the transfer matcher can link a bank <-> momo pair first
const NOTIFY_DELAY_MINUTES = 2;

/**
 * Sends Telegram notifications for transactions that are old enough and have
 * not been notified yet. State lives in the database (notified_at), so a
 * restart or redeploy no longer loses pending notifications.
 */
export async function flushPendingNotifications(): Promise<number> {
  // Claim rows first so overlapping runs (or two instances) never double-send
  const claimed = await query<{ id: string; notify_chat_id: string | null }>(
    `UPDATE transactions
        SET notified_at = NOW()
      WHERE id IN (
        SELECT id FROM transactions
         WHERE notified_at IS NULL
           AND category <> 'unparsed'
           AND created_at <= NOW() - ($1 || ' minutes')::interval
         ORDER BY created_at
         LIMIT 50
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, notify_chat_id`,
    [String(NOTIFY_DELAY_MINUTES)],
  );

  for (const row of claimed.rows) {
    try {
      await notifyNewTransaction(row.id, row.notify_chat_id);
    } catch (err) {
      console.error(`[notify] Failed to send notification for ${row.id}:`, err);
    }
  }

  return claimed.rows.length;
}

export function startNotificationPoller(): void {
  const run = () => {
    flushPendingNotifications().catch((err) => console.error('[notify] Poller error:', err));
  };
  run(); // catch anything left over from before a restart
  setInterval(run, POLL_INTERVAL_MS).unref();
}
