import { describe, test, expect, afterAll } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import * as schema from '../db/schema';
import { pullSince, pushEntries } from './sync';

const DEVICE_A = 'test-device-a';
const DEVICE_B = 'test-device-b';

// Fixture category/account, created once and cleaned up after the suite —
// transactions need real foreign keys to insert.
let categoryId: string;
let accountId: string;
const createdTransactionIds: string[] = [];

async function seedFixtures() {
  const [category] = await db
    .insert(schema.categories)
    .values({ name: 'Sync test category', deviceId: DEVICE_A, isSpending: true })
    .returning({ id: schema.categories.id });
  const [account] = await db
    .insert(schema.accounts)
    .values({ name: 'Sync test account', type: 'spending', deviceId: DEVICE_A })
    .returning({ id: schema.accounts.id });
  categoryId = category!.id;
  accountId = account!.id;
}

function transactionRow(overrides: Partial<Record<string, unknown>> = {}) {
  const id = (overrides.id as string) ?? crypto.randomUUID();
  return {
    id,
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    deviceId: DEVICE_A,
    date: '2026-01-15',
    amountPaise: 1000,
    direction: 'debit' as const,
    description: 'fixture',
    categoryId,
    accountId,
    note: null,
    isExcluded: false,
    source: 'manual' as const,
    importHash: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

await seedFixtures();

afterAll(async () => {
  for (const id of createdTransactionIds) {
    await db.delete(schema.transactions).where(eq(schema.transactions.id, id));
  }
  await db.delete(schema.categories).where(eq(schema.categories.id, categoryId));
  await db.delete(schema.accounts).where(eq(schema.accounts.id, accountId));
});

describe('pushEntries', () => {
  test('inserts a brand new row', async () => {
    const row = transactionRow();
    createdTransactionIds.push(row.id);

    const result = await pushEntries([{ table: 'transactions', operation: 'upsert', row }]);

    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.rejected).toEqual([]);
  });

  test('a newer update from another device overwrites the row', async () => {
    const id = crypto.randomUUID();
    createdTransactionIds.push(id);
    const base = transactionRow({ id, amountPaise: 1000, deviceId: DEVICE_A });
    await pushEntries([{ table: 'transactions', operation: 'upsert', row: base }]);

    const newer = transactionRow({
      id,
      amountPaise: 2000,
      deviceId: DEVICE_B,
      updatedAt: new Date(Date.now() + 10_000).toISOString(),
    });
    const result = await pushEntries([{ table: 'transactions', operation: 'upsert', row: newer }]);

    expect(result.applied).toBe(1);
    const [stored] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, id));
    expect(stored?.amountPaise).toBe(2000);
    expect(stored?.deviceId).toBe(DEVICE_B);
  });

  test('an older/stale push is skipped and does not overwrite a newer row (no duplication)', async () => {
    const id = crypto.randomUUID();
    createdTransactionIds.push(id);
    const current = transactionRow({
      id,
      amountPaise: 2000,
      updatedAt: new Date().toISOString(),
    });
    await pushEntries([{ table: 'transactions', operation: 'upsert', row: current }]);

    const stale = transactionRow({
      id,
      amountPaise: 999,
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
      description: 'STALE, must not apply',
    });
    const result = await pushEntries([{ table: 'transactions', operation: 'upsert', row: stale }]);

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);

    const rows = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amountPaise).toBe(2000);
  });

  test('replaying the exact same push twice never duplicates the row', async () => {
    const row = transactionRow();
    createdTransactionIds.push(row.id);

    await pushEntries([{ table: 'transactions', operation: 'upsert', row }]);
    const second = await pushEntries([{ table: 'transactions', operation: 'upsert', row }]);

    expect(second.applied).toBe(0);
    expect(second.skipped).toBe(1);
    const rows = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, row.id));
    expect(rows).toHaveLength(1);
  });

  test('a soft delete sets deleted_at and does not remove the row', async () => {
    const id = crypto.randomUUID();
    createdTransactionIds.push(id);
    const row = transactionRow({ id });
    await pushEntries([{ table: 'transactions', operation: 'upsert', row }]);

    const deleted = transactionRow({
      id,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date(Date.now() + 10_000).toISOString(),
    });
    const result = await pushEntries([{ table: 'transactions', operation: 'delete', row: deleted }]);

    expect(result.applied).toBe(1);
    const [stored] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, id));
    expect(stored).toBeDefined();
    expect(stored?.deletedAt).not.toBeNull();
  });

  test('operation "delete" without deletedAt set is rejected, not silently applied', async () => {
    const row = transactionRow({ deletedAt: null });
    // Not added to createdTransactionIds — this must never be written.

    const result = await pushEntries([{ table: 'transactions', operation: 'delete', row }]);

    expect(result.applied).toBe(0);
    expect(result.rejected).toHaveLength(1);
    const rows = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, row.id));
    expect(rows).toHaveLength(0);
  });

  test('a dangling foreign key is rejected per-row, not a 500 for the whole batch', async () => {
    const goodRow = transactionRow();
    const badRow = transactionRow({ categoryId: crypto.randomUUID() });
    createdTransactionIds.push(goodRow.id);

    const result = await pushEntries([
      { table: 'transactions', operation: 'upsert', row: goodRow },
      { table: 'transactions', operation: 'upsert', row: badRow },
    ]);

    expect(result.applied).toBe(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.id).toBe(badRow.id);
  });
});

describe('pullSince', () => {
  test('returns soft-deleted rows too (client needs them to remove local copies)', async () => {
    const id = crypto.randomUUID();
    createdTransactionIds.push(id);
    const row = transactionRow({ id, deletedAt: new Date().toISOString() });
    await pushEntries([{ table: 'transactions', operation: 'upsert', row }]);

    const result = await pullSince();
    const found = result.transactions.find((t) => t.id === id);
    expect(found).toBeDefined();
    expect(found?.deletedAt).not.toBeNull();
  });

  test('since filters out rows not updated after the given timestamp', async () => {
    const cursor = new Date().toISOString();
    const id = crypto.randomUUID();
    createdTransactionIds.push(id);
    await pushEntries([
      { table: 'transactions', operation: 'upsert', row: transactionRow({ id }) },
    ]);

    const result = await pullSince(cursor);
    expect(result.transactions.some((t) => t.id === id)).toBe(true);

    const emptyResult = await pullSince(new Date(Date.now() + 60_000).toISOString());
    expect(emptyResult.transactions.some((t) => t.id === id)).toBe(false);
  });
});
