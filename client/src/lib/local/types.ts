// Mirrors the ten synced Postgres tables (server/src/db/schema.ts). `sessions`
// is server-only auth state and is never synced, so it has no entry here.
export const SYNC_TABLES = [
  'accounts',
  'categories',
  'categoryAliases',
  'transactions',
  'rules',
  'monthlyPlans',
  'planLines',
  'commitments',
  'commitmentSettlements',
  'fundBuckets',
] as const;

export type SyncTableName = (typeof SYNC_TABLES)[number];

// Every synced row carries these four columns (SKILL.md hard rule 5) plus
// whatever business columns belong to its table — which no feature needs to
// query by column locally until phase 3+, so they travel as an open bag of
// fields rather than a per-table TypeScript type.
export interface SyncRow {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
  deviceId: string;
  [column: string]: unknown;
}

export type OutboxOperation = 'upsert' | 'delete';

export interface OutboxEntry {
  outboxId: number;
  table: SyncTableName;
  operation: OutboxOperation;
  row: SyncRow;
  createdAt: string;
  attempts: number;
}

export type NewOutboxEntry = Omit<OutboxEntry, 'outboxId' | 'createdAt' | 'attempts'>;

/**
 * One interface, two implementations (Capacitor SQLite on native, Dexie on
 * web) — feature code never knows which platform it's on (SKILL.md layout).
 */
export interface LocalStore {
  init(): Promise<void>;

  getRow(table: SyncTableName, id: string): Promise<SyncRow | undefined>;
  getAllRows(table: SyncTableName): Promise<SyncRow[]>;

  /**
   * Writes a row that just came from the server during a pull. Applies
   * last-write-wins against whatever is already stored locally — a pull
   * must never clobber a newer local edit that hasn't been pushed yet.
   */
  putRowsFromServer(table: SyncTableName, rows: SyncRow[]): Promise<void>;

  /**
   * Writes a row that originated on this device (a local create/update/soft
   * delete). Always wins locally — it's the newest edit by definition — and
   * the caller is responsible for also enqueueing the outbox entry.
   */
  putLocalRow(table: SyncTableName, row: SyncRow): Promise<void>;

  enqueueOutbox(entry: NewOutboxEntry): Promise<void>;
  getOutboxEntries(): Promise<OutboxEntry[]>;
  removeOutboxEntries(outboxIds: number[]): Promise<void>;
  bumpOutboxAttempts(outboxIds: number[]): Promise<void>;

  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
}
