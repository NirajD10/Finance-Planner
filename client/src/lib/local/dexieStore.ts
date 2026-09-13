import Dexie, { type Table } from 'dexie';
import { isNewer } from './merge';
import { SYNC_TABLES, type LocalStore, type NewOutboxEntry, type OutboxEntry, type SyncRow, type SyncTableName } from './types';

interface MetaRow {
  key: string;
  value: string;
}

class FinancePlannerDexie extends Dexie {
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('finance-planner');
    const tableStores = Object.fromEntries(SYNC_TABLES.map((name) => [name, 'id, updatedAt']));
    this.version(1).stores({
      ...tableStores,
      outbox: '++outboxId, table',
      meta: 'key',
    });
  }

  syncTable(name: SyncTableName): Table<SyncRow, string> {
    return this.table(name);
  }
}

// Web implementation of LocalStore. Native (Android) uses SQLite instead —
// see sqliteStore.ts — selected at runtime in index.ts.
export class DexieLocalStore implements LocalStore {
  private db = new FinancePlannerDexie();

  async init(): Promise<void> {
    await this.db.open();
  }

  async getRow(table: SyncTableName, id: string): Promise<SyncRow | undefined> {
    return this.db.syncTable(table).get(id);
  }

  async getAllRows(table: SyncTableName): Promise<SyncRow[]> {
    return this.db.syncTable(table).toArray();
  }

  async putRowsFromServer(table: SyncTableName, rows: SyncRow[]): Promise<void> {
    const t = this.db.syncTable(table);
    await this.db.transaction('rw', t, async () => {
      for (const row of rows) {
        const existing = await t.get(row.id);
        if (isNewer(row, existing)) {
          await t.put(row);
        }
      }
    });
  }

  async putLocalRow(table: SyncTableName, row: SyncRow): Promise<void> {
    await this.db.syncTable(table).put(row);
  }

  async enqueueOutbox(entry: NewOutboxEntry): Promise<void> {
    await this.db.outbox.add({
      ...entry,
      createdAt: new Date().toISOString(),
      attempts: 0,
    } as OutboxEntry);
  }

  async getOutboxEntries(): Promise<OutboxEntry[]> {
    return this.db.outbox.orderBy('outboxId').toArray();
  }

  async removeOutboxEntries(outboxIds: number[]): Promise<void> {
    await this.db.outbox.bulkDelete(outboxIds);
  }

  async bumpOutboxAttempts(outboxIds: number[]): Promise<void> {
    await this.db.transaction('rw', this.db.outbox, async () => {
      for (const outboxId of outboxIds) {
        const entry = await this.db.outbox.get(outboxId);
        if (entry) {
          await this.db.outbox.update(outboxId, { attempts: entry.attempts + 1 });
        }
      }
    });
  }

  async getMeta(key: string): Promise<string | undefined> {
    const row = await this.db.meta.get(key);
    return row?.value;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.db.meta.put({ key, value });
  }
}
