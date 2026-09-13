import { t } from 'elysia';

// Mirrors the four sync columns from db/schema.ts (SKILL.md hard rule 5).
// updatedAt/deletedAt are ISO timestamp strings on the wire (TypeBox has no
// Date type — Elysia serialises JSON, so dates always cross as strings).
const syncColumns = {
  id: t.String({ format: 'uuid' }),
  updatedAt: t.String({ format: 'date-time' }),
  deletedAt: t.Union([t.String({ format: 'date-time' }), t.Null()]),
  deviceId: t.String({ minLength: 1 }),
};

export const accountSchema = t.Object({
  ...syncColumns,
  name: t.String({ minLength: 1 }),
  type: t.Union([t.Literal('spending'), t.Literal('savings')]),
  openingBalancePaise: t.Integer(),
  isEmergencyFund: t.Boolean(),
});

export const categorySchema = t.Object({
  ...syncColumns,
  name: t.String({ minLength: 1 }),
  group: t.Union([
    t.Literal('essential'),
    t.Literal('lifestyle'),
    t.Literal('savings'),
    t.Literal('excluded'),
    t.Null(),
  ]),
  monthlyBudgetPaise: t.Union([t.Integer(), t.Null()]),
  isSpending: t.Boolean(),
  sortOrder: t.Integer(),
});

export const categoryAliasSchema = t.Object({
  ...syncColumns,
  categoryId: t.String({ format: 'uuid' }),
  alias: t.String({ minLength: 1 }),
});

export const transactionSchema = t.Object({
  ...syncColumns,
  date: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
  amountPaise: t.Integer({ minimum: 0 }),
  direction: t.Union([t.Literal('debit'), t.Literal('credit')]),
  description: t.String(),
  categoryId: t.String({ format: 'uuid' }),
  accountId: t.String({ format: 'uuid' }),
  note: t.Union([t.String(), t.Null()]),
  isExcluded: t.Boolean(),
  source: t.Union([t.Literal('manual'), t.Literal('quickadd'), t.Literal('import')]),
  importHash: t.Union([t.String(), t.Null()]),
  createdAt: t.String({ format: 'date-time' }),
});

export const ruleSchema = t.Object({
  ...syncColumns,
  matchText: t.String({ minLength: 1 }),
  matchField: t.String({ minLength: 1 }),
  amountMinPaise: t.Union([t.Integer(), t.Null()]),
  amountMaxPaise: t.Union([t.Integer(), t.Null()]),
  categoryId: t.String({ format: 'uuid' }),
  priority: t.Integer(),
  createdAt: t.String({ format: 'date-time' }),
});

export const monthlyPlanSchema = t.Object({
  ...syncColumns,
  yearMonth: t.String({ pattern: '^\\d{4}-\\d{2}$' }),
  salaryPaise: t.Integer(),
  sipAmountPaise: t.Integer(),
  emergencyTransferPaise: t.Integer(),
  sinkingTransferPaise: t.Integer(),
  status: t.Union([t.Literal('open'), t.Literal('closed')]),
  closedAt: t.Union([t.String({ format: 'date-time' }), t.Null()]),
});

export const planLineSchema = t.Object({
  ...syncColumns,
  planId: t.String({ format: 'uuid' }),
  categoryId: t.String({ format: 'uuid' }),
  plannedAmountPaise: t.Integer(),
  actualAmountPaise: t.Union([t.Integer(), t.Null()]),
});

export const commitmentSchema = t.Object({
  ...syncColumns,
  direction: t.Union([t.Literal('payable'), t.Literal('receivable')]),
  counterparty: t.String({ minLength: 1 }),
  description: t.String(),
  amountPaise: t.Integer({ minimum: 0 }),
  settledAmountPaise: t.Integer({ minimum: 0 }),
  categoryId: t.String({ format: 'uuid' }),
  dueMonth: t.String({ pattern: '^\\d{4}-\\d{2}$' }),
  status: t.Union([
    t.Literal('open'),
    t.Literal('partial'),
    t.Literal('settled'),
    t.Literal('written_off'),
  ]),
  notes: t.Union([t.String(), t.Null()]),
});

export const commitmentSettlementSchema = t.Object({
  ...syncColumns,
  commitmentId: t.String({ format: 'uuid' }),
  transactionId: t.String({ format: 'uuid' }),
  amountPaise: t.Integer({ minimum: 0 }),
  settledOn: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
});

export const fundBucketSchema = t.Object({
  ...syncColumns,
  accountId: t.String({ format: 'uuid' }),
  name: t.Union([t.Literal('emergency'), t.Literal('sinking')]),
  balancePaise: t.Integer(),
});
