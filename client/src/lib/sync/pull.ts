import { syncPull } from '../api-client';
import { getLocalStore, SYNC_TABLES } from '../local';

const LAST_SYNCED_AT_KEY = 'lastSyncedAt';

/**
 * Pulls everything changed since the last successful pull and merges it
 * into local storage (last-write-wins per row, handled inside the store).
 * Returns the server's clock as the caller's new cursor — never the
 * device's own, which is the clock-skew trap PLAN.md calls out explicitly.
 */
export async function pullFromServer(accessToken: string): Promise<string> {
  const store = await getLocalStore();
  const since = await store.getMeta(LAST_SYNCED_AT_KEY);
  const result = await syncPull(accessToken, since);

  for (const table of SYNC_TABLES) {
    await store.putRowsFromServer(table, result[table]);
  }

  await store.setMeta(LAST_SYNCED_AT_KEY, result.serverTime);
  return result.serverTime;
}
