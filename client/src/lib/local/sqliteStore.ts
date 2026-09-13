import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { isNewer } from './merge';
import { SYNC_TABLES, type LocalStore, type NewOutboxEntry, type OutboxEntry, type SyncRow, type SyncTableName } from './types';

const DB_NAME = 'finance_planner';

// Every synced table gets a single-purpose column layout: id/updated_at as
// real (indexed) columns for the merge comparison and pull cursor, plus the
// full row (all business columns) as a JSON blob. Per-feature columns for
// direct SQL filtering land in a later phase, once the UI actually needs
// e.g. "transactions in date range X" as a local query rather than an
// in-memory filter over getAllRows().
function createTablesSql(): string {
  const perTable = SYNC_TABLES.map(
    (name) => `
      CREATE TABLE IF NOT EXISTS ${name} (
        id TEXT PRIMARY KEY NOT NULL,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_${name}_updated_at ON ${name}(updated_at);
    `
  ).join('\n');

  return `
    ${perTable}
    CREATE TABLE IF NOT EXISTS outbox (
      outbox_id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL,
      row_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `;
}

export class SqliteLocalStore implements LocalStore {
  private connection = new SQLiteConnection(CapacitorSQLite);
  private db!: SQLiteDBConnection;

  async init(): Promise<void> {
    const isConn = await this.connection.isConnection(DB_NAME, false);
    this.db = isConn.result
      ? await this.connection.retrieveConnection(DB_NAME, false)
      : await this.connection.createConnection(DB_NAME, false, 'no-encryption', 1, false);
    await this.db.open();
    await this.db.execute(createTablesSql());
  }

  async getRow(table: SyncTableName, id: string): Promise<SyncRow | undefined> {
    const result = await this.db.query(`SELECT data FROM ${table} WHERE id = ?`, [id]);
    const row = result.values?.[0];
    return row ? (JSON.parse(row.data as string) as SyncRow) : undefined;
  }

  async getAllRows(table: SyncTableName): Promise<SyncRow[]> {
    const result = await this.db.query(`SELECT data FROM ${table}`);
    return (result.values ?? []).map((row) => JSON.parse(row.data as string) as SyncRow);
  }

  async putRowsFromServer(table: SyncTableName, rows: SyncRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.execute('BEGIN TRANSACTION');
    try {
      for (const row of rows) {
        const existing = await this.getRow(table, row.id);
        if (isNewer(row, existing)) {
          await this.upsertRow(table, row);
        }
      }
      await this.db.execute('COMMIT');
    } catch (err) {
      await this.db.execute('ROLLBACK');
      throw err;
    }
  }

  async putLocalRow(table: SyncTableName, row: SyncRow): Promise<void> {
    await this.upsertRow(table, row);
  }

  private async upsertRow(table: SyncTableName, row: SyncRow): Promise<void> {
    await this.db.run(
      `INSERT INTO ${table} (id, updated_at, data) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data`,
      [row.id, row.updatedAt, JSON.stringify(row)]
    );
  }

  async enqueueOutbox(entry: NewOutboxEntry): Promise<void> {
    await this.db.run(
      `INSERT INTO outbox (table_name, operation, row_json, created_at, attempts) VALUES (?, ?, ?, ?, 0)`,
      [entry.table, entry.operation, JSON.stringify(entry.row), new Date().toISOString()]
    );
  }

  async getOutboxEntries(): Promise<OutboxEntry[]> {
    const result = await this.db.query(`SELECT * FROM outbox ORDER BY outbox_id ASC`);
    return (result.values ?? []).map((r) => ({
      outboxId: r.outbox_id as number,
      table: r.table_name as SyncTableName,
      operation: r.operation as OutboxEntry['operation'],
      row: JSON.parse(r.row_json as string) as SyncRow,
      createdAt: r.created_at as string,
      attempts: r.attempts as number,
    }));
  }

  async removeOutboxEntries(outboxIds: number[]): Promise<void> {
    if (outboxIds.length === 0) return;
    const placeholders = outboxIds.map(() => '?').join(', ');
    await this.db.run(`DELETE FROM outbox WHERE outbox_id IN (${placeholders})`, outboxIds);
  }

  async bumpOutboxAttempts(outboxIds: number[]): Promise<void> {
    if (outboxIds.length === 0) return;
    const placeholders = outboxIds.map(() => '?').join(', ');
    await this.db.run(
      `UPDATE outbox SET attempts = attempts + 1 WHERE outbox_id IN (${placeholders})`,
      outboxIds
    );
  }

  async getMeta(key: string): Promise<string | undefined> {
    const result = await this.db.query(`SELECT value FROM meta WHERE key = ?`, [key]);
    return result.values?.[0]?.value as string | undefined;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.db.run(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    );
  }
}
