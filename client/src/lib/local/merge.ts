import type { SyncRow } from './types';

/**
 * Last-write-wins on updated_at (PLAN.md phase 2 / SKILL.md hard rule 5).
 * Shared by both LocalStore implementations so the merge decision — the one
 * thing that must behave identically on Dexie and SQLite — lives in exactly
 * one place instead of being reimplemented per backend.
 */
export function isNewer(incoming: SyncRow, existing: SyncRow | undefined): boolean {
  if (!existing) return true;
  return new Date(incoming.updatedAt).getTime() > new Date(existing.updatedAt).getTime();
}
