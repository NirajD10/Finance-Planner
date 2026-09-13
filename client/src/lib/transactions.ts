import { getLocalStore } from './local';
import type { SyncRow } from './local/types';
import { upsertRow, softDeleteRow } from './local/mutations';

export type TransactionDirection = 'debit' | 'credit';
export type TransactionSource = 'manual' | 'quickadd' | 'import';

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD, local time (SKILL.md conventions)
  amountPaise: number;
  direction: TransactionDirection;
  description: string;
  categoryId: string;
  accountId: string;
  note: string | null;
  isExcluded: boolean;
  source: TransactionSource;
  importHash: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TransactionInput {
  date: string;
  amountPaise: number;
  direction: TransactionDirection;
  description: string;
  categoryId: string;
  accountId: string;
  note: string | null;
  isExcluded: boolean;
  source: TransactionSource;
}

function toTransaction(row: SyncRow): Transaction {
  return {
    id: row.id,
    date: row.date as string,
    amountPaise: row.amountPaise as number,
    direction: row.direction as TransactionDirection,
    description: row.description as string,
    categoryId: row.categoryId as string,
    accountId: row.accountId as string,
    note: (row.note as string | null) ?? null,
    isExcluded: row.isExcluded as boolean,
    source: row.source as TransactionSource,
    importHash: (row.importHash as string | null) ?? null,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

// Local calendar date, not UTC — a spend at 11pm belongs to that day
// (SKILL.md conventions), which Date#toISOString would get wrong near
// midnight in any timezone ahead of UTC.
export function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** All live (non-deleted) transactions, newest first. */
export async function listTransactions(): Promise<Transaction[]> {
  const store = await getLocalStore();
  const rows = await store.getAllRows('transactions');
  return rows
    .filter((row) => row.deletedAt == null)
    .map(toTransaction)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export async function createTransaction(
  input: TransactionInput,
  accessToken: string
): Promise<Transaction> {
  const row = await upsertRow(
    'transactions',
    {
      id: crypto.randomUUID(),
      ...input,
      importHash: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    },
    accessToken
  );
  return toTransaction(row);
}

export async function updateTransaction(
  id: string,
  patch: Partial<TransactionInput>,
  accessToken: string
): Promise<Transaction> {
  const store = await getLocalStore();
  const existing = await store.getRow('transactions', id);
  if (!existing) throw new Error('Transaction not found');
  const row = await upsertRow('transactions', { ...existing, ...patch }, accessToken);
  return toTransaction(row);
}

/** Inline recategorise from the list — needs no navigation. */
export function recategoriseTransaction(
  id: string,
  categoryId: string,
  accessToken: string
): Promise<Transaction> {
  return updateTransaction(id, { categoryId }, accessToken);
}

export async function softDeleteTransaction(id: string, accessToken: string): Promise<Transaction> {
  const store = await getLocalStore();
  const existing = await store.getRow('transactions', id);
  if (!existing) throw new Error('Transaction not found');
  const row = await softDeleteRow(
    'transactions',
    { ...existing, deletedAt: new Date().toISOString() },
    accessToken
  );
  return toTransaction(row);
}

/**
 * Undo for a swipe-to-delete: a fresh upsert with deletedAt cleared and a
 * newer updatedAt, so last-write-wins correctly un-deletes on every device
 * instead of resurrecting the stale pre-delete row.
 */
export async function restoreTransaction(id: string, accessToken: string): Promise<Transaction> {
  const store = await getLocalStore();
  const existing = await store.getRow('transactions', id);
  if (!existing) throw new Error('Transaction not found');
  const row = await upsertRow('transactions', { ...existing, deletedAt: null }, accessToken);
  return toTransaction(row);
}

/** Groups already-sorted (newest first) transactions by YYYY-MM. */
export function groupByMonth(transactions: Transaction[]): Map<string, Transaction[]> {
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const month = tx.date.slice(0, 7);
    const group = groups.get(month);
    if (group) group.push(tx);
    else groups.set(month, [tx]);
  }
  return groups;
}
