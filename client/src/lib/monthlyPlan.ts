import { getLocalStore } from './local';
import type { SyncRow } from './local/types';
import { upsertRow, softDeleteRow } from './local/mutations';

export type PlanStatus = 'open' | 'closed';

export interface MonthlyPlan {
  id: string;
  yearMonth: string;
  salaryPaise: number;
  sipAmountPaise: number;
  emergencyTransferPaise: number;
  sinkingTransferPaise: number;
  status: PlanStatus;
  closedAt: string | null;
}

export interface PlanLine {
  id: string;
  planId: string;
  categoryId: string;
  plannedAmountPaise: number;
  actualAmountPaise: number | null;
}

function toPlan(row: SyncRow): MonthlyPlan {
  return {
    id: row.id,
    yearMonth: row.yearMonth as string,
    salaryPaise: row.salaryPaise as number,
    sipAmountPaise: row.sipAmountPaise as number,
    emergencyTransferPaise: row.emergencyTransferPaise as number,
    sinkingTransferPaise: row.sinkingTransferPaise as number,
    status: row.status as PlanStatus,
    closedAt: (row.closedAt as string | null) ?? null,
  };
}

function toPlanLine(row: SyncRow): PlanLine {
  return {
    id: row.id,
    planId: row.planId as string,
    categoryId: row.categoryId as string,
    plannedAmountPaise: row.plannedAmountPaise as number,
    actualAmountPaise: (row.actualAmountPaise as number | null) ?? null,
  };
}

export async function listMonthlyPlans(): Promise<MonthlyPlan[]> {
  const store = await getLocalStore();
  const rows = await store.getAllRows('monthlyPlans');
  return rows.filter((row) => row.deletedAt == null).map(toPlan);
}

export async function getPlanForMonth(yearMonth: string): Promise<MonthlyPlan | undefined> {
  const plans = await listMonthlyPlans();
  return plans.find((plan) => plan.yearMonth === yearMonth);
}

export async function listPlanLines(planId: string): Promise<PlanLine[]> {
  const store = await getLocalStore();
  const rows = await store.getAllRows('planLines');
  return rows
    .filter((row) => row.deletedAt == null && row.planId === planId)
    .map(toPlanLine);
}

export interface PlanLineInput {
  categoryId: string;
  plannedAmountPaise: number;
}

export interface SavePlanInput {
  yearMonth: string;
  salaryPaise: number;
  sipAmountPaise: number;
  emergencyTransferPaise: number;
  sinkingTransferPaise: number;
  lines: PlanLineInput[];
}

/**
 * Creates the plan for `yearMonth` if none exists yet, otherwise updates the
 * existing one in place — `monthly_plans` has a unique index on yearMonth
 * (excluding soft-deleted rows), so this must reuse the existing id rather
 * than insert a second row. Plan lines are replaced wholesale: simplest
 * correct approach given there are only ever a handful of budgeted
 * categories, so a full diff isn't worth the complexity.
 */
export async function saveMonthlyPlan(
  input: SavePlanInput,
  accessToken: string
): Promise<MonthlyPlan> {
  const store = await getLocalStore();
  const existing = await getPlanForMonth(input.yearMonth);
  const planId = existing?.id ?? crypto.randomUUID();

  const planRow = await upsertRow(
    'monthlyPlans',
    {
      id: planId,
      yearMonth: input.yearMonth,
      salaryPaise: input.salaryPaise,
      sipAmountPaise: input.sipAmountPaise,
      emergencyTransferPaise: input.emergencyTransferPaise,
      sinkingTransferPaise: input.sinkingTransferPaise,
      status: existing?.status ?? 'open',
      closedAt: existing?.closedAt ?? null,
      deletedAt: null,
    },
    accessToken
  );

  const existingLines = existing ? await listPlanLines(existing.id) : [];
  const remainingExisting = new Map(existingLines.map((line) => [line.categoryId, line]));

  for (const line of input.lines) {
    const existingLine = remainingExisting.get(line.categoryId);
    remainingExisting.delete(line.categoryId);
    await upsertRow(
      'planLines',
      {
        id: existingLine?.id ?? crypto.randomUUID(),
        planId,
        categoryId: line.categoryId,
        plannedAmountPaise: line.plannedAmountPaise,
        actualAmountPaise: existingLine?.actualAmountPaise ?? null,
        deletedAt: null,
      },
      accessToken
    );
  }

  // Any line still left here was removed from the form (category unchecked)
  // — soft-delete it rather than leaving a stale budget line around.
  for (const line of remainingExisting.values()) {
    const row = await store.getRow('planLines', line.id);
    if (row) {
      await softDeleteRow(
        'planLines',
        { ...row, deletedAt: new Date().toISOString() },
        accessToken
      );
    }
  }

  return toPlan(planRow);
}

/**
 * Returns a draft (not yet saved) built from `sourceYearMonth`'s plan, for
 * the caller to prefill an editor with before the user commits it via
 * saveMonthlyPlan — "copy from last month" is a starting point, not an
 * automatic action.
 */
export async function copyPlanFromMonth(
  sourceYearMonth: string,
  targetYearMonth: string
): Promise<SavePlanInput | undefined> {
  const source = await getPlanForMonth(sourceYearMonth);
  if (!source) return undefined;
  const lines = await listPlanLines(source.id);
  return {
    yearMonth: targetYearMonth,
    salaryPaise: source.salaryPaise,
    sipAmountPaise: source.sipAmountPaise,
    emergencyTransferPaise: source.emergencyTransferPaise,
    sinkingTransferPaise: source.sinkingTransferPaise,
    lines: lines.map((line) => ({
      categoryId: line.categoryId,
      plannedAmountPaise: line.plannedAmountPaise,
    })),
  };
}
