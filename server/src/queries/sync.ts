import { sql, gte } from 'drizzle-orm';
import { db } from '../db/client';
import * as schema from '../db/schema';
import type { syncPullResponseSchema, syncPushBodySchema } from '../schemas/sync';
import type { Static } from 'elysia';

type PullResult = Omit<Static<typeof syncPullResponseSchema>, 'serverTime'>;
type PushEntry = Static<typeof syncPushBodySchema>['entries'][number];

// Timestamp columns across the schema (db/schema.ts) — every other synced
// column is either text/number/bool or a plain YYYY-MM(-DD) string, so no
// Date<->string coercion is needed for it.
const TIMESTAMP_FIELDS = ['updatedAt', 'deletedAt', 'createdAt', 'closedAt'] as const;

type TimestampFieldName = (typeof TIMESTAMP_FIELDS)[number];

// Only remaps the four known timestamp fields by name — everything else on
// the row passes through as-is, whatever type it happens to be.
type WithDatesAsStrings<T> = {
  [K in keyof T]: K extends TimestampFieldName
    ? null extends T[K]
      ? string | null
      : string
    : T[K];
};

type WithStringsAsDates<T> = {
  [K in keyof T]: K extends TimestampFieldName
    ? null extends T[K]
      ? Date | null
      : Date
    : T[K];
};

// Rows come off the wire as ISO strings (TypeBox has no Date type); Drizzle's
// default timestamp column mode expects real Date instances going in. This
// only touches TIMESTAMP_FIELDS — everything else on a row (ids, enums,
// YYYY-MM-DD date columns, etc.) is left exactly as it came in.
function coerceTimestampsIn<T extends Record<string, unknown>>(row: T): WithStringsAsDates<T> {
  const out: Record<string, unknown> = { ...row };
  for (const field of TIMESTAMP_FIELDS) {
    if (field in out && out[field] != null) {
      out[field] = new Date(out[field] as string);
    }
  }
  return out as WithStringsAsDates<T>;
}

// Inverse of the above, applied to rows read back out of the DB before they
// go on the wire.
function serializeTimestampsOut<T extends Record<string, unknown>>(row: T): WithDatesAsStrings<T> {
  const out: Record<string, unknown> = { ...row };
  for (const field of TIMESTAMP_FIELDS) {
    const value = out[field];
    if (value instanceof Date) {
      out[field] = value.toISOString();
    }
  }
  return out as WithDatesAsStrings<T>;
}

/**
 * All rows across the ten synced tables with updated_at >= since (or all
 * rows if since is omitted, i.e. a first-ever pull). Soft-deleted rows are
 * included deliberately — the client needs them to remove local copies.
 *
 * Inclusive (>=), not exclusive: `since` is the previous pull's serverTime,
 * and a row written in the exact same instant as that pull must not be
 * missed. The cost is that the boundary row can be re-delivered once more —
 * harmless, since applying an already-current row is a no-op.
 */
export async function pullSince(since?: string): Promise<PullResult> {
  const sinceDate = since ? new Date(since) : undefined;

  const [
    accounts,
    categories,
    categoryAliases,
    transactions,
    rules,
    monthlyPlans,
    planLines,
    commitments,
    commitmentSettlements,
    fundBuckets,
  ] = await Promise.all([
    sinceDate
      ? db.select().from(schema.accounts).where(gte(schema.accounts.updatedAt, sinceDate))
      : db.select().from(schema.accounts),
    sinceDate
      ? db.select().from(schema.categories).where(gte(schema.categories.updatedAt, sinceDate))
      : db.select().from(schema.categories),
    sinceDate
      ? db
          .select()
          .from(schema.categoryAliases)
          .where(gte(schema.categoryAliases.updatedAt, sinceDate))
      : db.select().from(schema.categoryAliases),
    sinceDate
      ? db.select().from(schema.transactions).where(gte(schema.transactions.updatedAt, sinceDate))
      : db.select().from(schema.transactions),
    sinceDate
      ? db.select().from(schema.rules).where(gte(schema.rules.updatedAt, sinceDate))
      : db.select().from(schema.rules),
    sinceDate
      ? db.select().from(schema.monthlyPlans).where(gte(schema.monthlyPlans.updatedAt, sinceDate))
      : db.select().from(schema.monthlyPlans),
    sinceDate
      ? db.select().from(schema.planLines).where(gte(schema.planLines.updatedAt, sinceDate))
      : db.select().from(schema.planLines),
    sinceDate
      ? db.select().from(schema.commitments).where(gte(schema.commitments.updatedAt, sinceDate))
      : db.select().from(schema.commitments),
    sinceDate
      ? db
          .select()
          .from(schema.commitmentSettlements)
          .where(gte(schema.commitmentSettlements.updatedAt, sinceDate))
      : db.select().from(schema.commitmentSettlements),
    sinceDate
      ? db.select().from(schema.fundBuckets).where(gte(schema.fundBuckets.updatedAt, sinceDate))
      : db.select().from(schema.fundBuckets),
  ]);

  return {
    accounts: accounts.map(serializeTimestampsOut),
    categories: categories.map(serializeTimestampsOut),
    categoryAliases: categoryAliases.map(serializeTimestampsOut),
    transactions: transactions.map(serializeTimestampsOut),
    rules: rules.map(serializeTimestampsOut),
    monthlyPlans: monthlyPlans.map(serializeTimestampsOut),
    planLines: planLines.map(serializeTimestampsOut),
    commitments: commitments.map(serializeTimestampsOut),
    commitmentSettlements: commitmentSettlements.map(serializeTimestampsOut),
    fundBuckets: fundBuckets.map(serializeTimestampsOut),
  } satisfies PullResult;
}

// Applies one outbox entry with a single atomic upsert: insert on no
// conflict, or update only if the incoming row is newer than what's already
// there (last-write-wins on updated_at, SKILL.md hard rule + PLAN.md phase 2).
// Returns whether the row was actually written (false = an older/duplicate
// push, not an error — the retry-without-duplicating case in PLAN.md).
async function applyEntry(entry: PushEntry): Promise<boolean> {
  switch (entry.table) {
    case 'accounts': {
      const row = coerceTimestampsIn(entry.row);
      const result = await db
        .insert(schema.accounts)
        .values(row)
        .onConflictDoUpdate({
          target: schema.accounts.id,
          set: row,
          setWhere: sql`${schema.accounts.updatedAt} < ${entry.row.updatedAt}::timestamptz`,
        })
        .returning({ id: schema.accounts.id });
      return result.length > 0;
    }
    case 'categories': {
      const row = coerceTimestampsIn(entry.row);
      const result = await db
        .insert(schema.categories)
        .values(row)
        .onConflictDoUpdate({
          target: schema.categories.id,
          set: row,
          setWhere: sql`${schema.categories.updatedAt} < ${entry.row.updatedAt}::timestamptz`,
        })
        .returning({ id: schema.categories.id });
      return result.length > 0;
    }
    case 'categoryAliases': {
      const row = coerceTimestampsIn(entry.row);
      const result = await db
        .insert(schema.categoryAliases)
        .values(row)
        .onConflictDoUpdate({
          target: schema.categoryAliases.id,
          set: row,
          setWhere: sql`${schema.categoryAliases.updatedAt} < ${entry.row.updatedAt}::timestamptz`,
        })
        .returning({ id: schema.categoryAliases.id });
      return result.length > 0;
    }
    case 'transactions': {
      const row = coerceTimestampsIn(entry.row);
      const result = await db
        .insert(schema.transactions)
        .values(row)
        .onConflictDoUpdate({
          target: schema.transactions.id,
          set: row,
          setWhere: sql`${schema.transactions.updatedAt} < ${entry.row.updatedAt}::timestamptz`,
        })
        .returning({ id: schema.transactions.id });
      return result.length > 0;
    }
    case 'rules': {
      const row = coerceTimestampsIn(entry.row);
      const result = await db
        .insert(schema.rules)
        .values(row)
        .onConflictDoUpdate({
          target: schema.rules.id,
          set: row,
          setWhere: sql`${schema.rules.updatedAt} < ${entry.row.updatedAt}::timestamptz`,
        })
        .returning({ id: schema.rules.id });
      return result.length > 0;
    }
    case 'monthlyPlans': {
      const row = coerceTimestampsIn(entry.row);
      const result = await db
        .insert(schema.monthlyPlans)
        .values(row)
        .onConflictDoUpdate({
          target: schema.monthlyPlans.id,
          set: row,
          setWhere: sql`${schema.monthlyPlans.updatedAt} < ${entry.row.updatedAt}::timestamptz`,
        })
        .returning({ id: schema.monthlyPlans.id });
      return result.length > 0;
    }
    case 'planLines': {
      const row = coerceTimestampsIn(entry.row);
      const result = await db
        .insert(schema.planLines)
        .values(row)
        .onConflictDoUpdate({
          target: schema.planLines.id,
          set: row,
          setWhere: sql`${schema.planLines.updatedAt} < ${entry.row.updatedAt}::timestamptz`,
        })
        .returning({ id: schema.planLines.id });
      return result.length > 0;
    }
    case 'commitments': {
      const row = coerceTimestampsIn(entry.row);
      const result = await db
        .insert(schema.commitments)
        .values(row)
        .onConflictDoUpdate({
          target: schema.commitments.id,
          set: row,
          setWhere: sql`${schema.commitments.updatedAt} < ${entry.row.updatedAt}::timestamptz`,
        })
        .returning({ id: schema.commitments.id });
      return result.length > 0;
    }
    case 'commitmentSettlements': {
      const row = coerceTimestampsIn(entry.row);
      const result = await db
        .insert(schema.commitmentSettlements)
        .values(row)
        .onConflictDoUpdate({
          target: schema.commitmentSettlements.id,
          set: row,
          setWhere: sql`${schema.commitmentSettlements.updatedAt} < ${entry.row.updatedAt}::timestamptz`,
        })
        .returning({ id: schema.commitmentSettlements.id });
      return result.length > 0;
    }
    case 'fundBuckets': {
      const row = coerceTimestampsIn(entry.row);
      const result = await db
        .insert(schema.fundBuckets)
        .values(row)
        .onConflictDoUpdate({
          target: schema.fundBuckets.id,
          set: row,
          setWhere: sql`${schema.fundBuckets.updatedAt} < ${entry.row.updatedAt}::timestamptz`,
        })
        .returning({ id: schema.fundBuckets.id });
      return result.length > 0;
    }
  }
}

export async function pushEntries(
  entries: PushEntry[]
): Promise<{ applied: number; skipped: number; rejected: { table: string; id: string; error: string }[] }> {
  let applied = 0;
  let skipped = 0;
  const rejected: { table: string; id: string; error: string }[] = [];

  for (const entry of entries) {
    if (entry.operation === 'delete' && entry.row.deletedAt == null) {
      rejected.push({
        table: entry.table,
        id: entry.row.id,
        error: 'operation "delete" requires deletedAt to be set (soft delete only)',
      });
      continue;
    }
    try {
      const wasApplied = await applyEntry(entry);
      if (wasApplied) applied++;
      else skipped++;
    } catch (err) {
      // Never let a raw Postgres error reach the client (SKILL.md conventions) —
      // most likely cause here is a dangling FK (e.g. a category not yet synced).
      rejected.push({
        table: entry.table,
        id: entry.row.id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return { applied, skipped, rejected };
}
