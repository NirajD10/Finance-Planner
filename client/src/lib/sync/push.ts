import { syncPush } from '../api-client';
import { getLocalStore } from '../local';

export interface DrainResult {
  pushed: number;
  applied: number;
  skipped: number;
  rejected: number;
}

/**
 * Sends every queued outbox entry in one batch and reconciles the outbox
 * against the server's per-row outcome. "Applied" and "skipped" (a stale
 * push superseded by a newer server row) are both terminal for this attempt
 * — replaying either again would not change the outcome — so both are
 * removed from the outbox. Only rows the server actually rejected are kept
 * for a retry, which is what makes retrying safe: a re-sent row that was
 * already applied is a no-op on the server (PLAN.md "a failed sync retries
 * without duplicating rows").
 */
export async function drainOutbox(accessToken: string): Promise<DrainResult> {
  const store = await getLocalStore();
  const entries = await store.getOutboxEntries();
  if (entries.length === 0) {
    return { pushed: 0, applied: 0, skipped: 0, rejected: 0 };
  }

  const result = await syncPush(
    accessToken,
    entries.map((entry) => ({ table: entry.table, operation: entry.operation, row: entry.row }))
  );

  const rejectedIds = new Set(result.rejected.map((r) => r.id));
  const resolved = entries.filter((entry) => !rejectedIds.has(entry.row.id));
  const toRetry = entries.filter((entry) => rejectedIds.has(entry.row.id));

  if (resolved.length > 0) {
    await store.removeOutboxEntries(resolved.map((entry) => entry.outboxId));
  }
  if (toRetry.length > 0) {
    await store.bumpOutboxAttempts(toRetry.map((entry) => entry.outboxId));
  }

  return {
    pushed: entries.length,
    applied: result.applied,
    skipped: result.skipped,
    rejected: result.rejected.length,
  };
}
