import { getLocalStore } from './index';
import type { SyncRow, SyncTableName } from './types';
import { getOrCreateDeviceId } from '../auth/tokenStorage';
import { scheduleSyncAfterWrite } from '../sync/triggers';

type RowInput = Omit<SyncRow, 'updatedAt' | 'deviceId'>;

/**
 * The one path every feature mutation goes through: write locally, enqueue
 * the outbox entry, then kick the debounced sync — never await the network
 * (SKILL.md hard rule 7). Shared here so phase 3+ features don't each
 * reimplement the outbox dance.
 */
async function writeRow(
  table: SyncTableName,
  row: RowInput,
  operation: 'upsert' | 'delete',
  accessToken: string
): Promise<SyncRow> {
  const deviceId = await getOrCreateDeviceId();
  const fullRow = { ...row, updatedAt: new Date().toISOString(), deviceId } as SyncRow;
  const store = await getLocalStore();
  await store.putLocalRow(table, fullRow);
  await store.enqueueOutbox({ table, operation, row: fullRow });
  scheduleSyncAfterWrite(accessToken);
  return fullRow;
}

export function upsertRow(table: SyncTableName, row: RowInput, accessToken: string): Promise<SyncRow> {
  return writeRow(table, row, 'upsert', accessToken);
}

// Soft delete only (SKILL.md hard rule 6) — row must already carry a
// non-null deletedAt; the server rejects a "delete" operation without one.
export function softDeleteRow(
  table: SyncTableName,
  row: RowInput & { deletedAt: string },
  accessToken: string
): Promise<SyncRow> {
  return writeRow(table, row, 'delete', accessToken);
}
