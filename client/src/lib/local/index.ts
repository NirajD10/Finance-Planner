import { Capacitor } from '@capacitor/core';
import type { LocalStore } from './types';

export type { LocalStore, SyncRow, SyncTableName, OutboxEntry, OutboxOperation } from './types';
export { SYNC_TABLES } from './types';

let instance: LocalStore | undefined;

// Picked once per app session: SQLite on native (Android), Dexie on web.
// Feature code always goes through this — never imports either backend
// directly (SKILL.md layout: "Feature code never knows which platform it's on").
export async function getLocalStore(): Promise<LocalStore> {
  if (instance) return instance;

  if (Capacitor.isNativePlatform()) {
    const { SqliteLocalStore } = await import('./sqliteStore');
    instance = new SqliteLocalStore();
  } else {
    const { DexieLocalStore } = await import('./dexieStore');
    instance = new DexieLocalStore();
  }

  await instance.init();
  return instance;
}
