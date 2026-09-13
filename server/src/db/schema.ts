import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  boolean,
  integer,
  timestamp,
  date,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Every synced table carries these four columns (PRD §5 / SKILL.md hard rule 5).
// A function (not a shared object) so each table gets fresh column-builder instances.
function syncColumns() {
  return {
    id: uuid('id').primaryKey().defaultRandom(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deviceId: text('device_id').notNull(),
  };
}

export const accountTypeEnum = pgEnum('account_type', ['spending', 'savings']);
export const categoryGroupEnum = pgEnum('category_group', [
  'essential',
  'lifestyle',
  'savings',
  'excluded',
]);
export const transactionDirectionEnum = pgEnum('transaction_direction', ['debit', 'credit']);
export const transactionSourceEnum = pgEnum('transaction_source', [
  'manual',
  'quickadd',
  'import',
]);
export const monthlyPlanStatusEnum = pgEnum('monthly_plan_status', ['open', 'closed']);
export const commitmentDirectionEnum = pgEnum('commitment_direction', ['payable', 'receivable']);
export const commitmentStatusEnum = pgEnum('commitment_status', [
  'open',
  'partial',
  'settled',
  'written_off',
]);
export const fundBucketNameEnum = pgEnum('fund_bucket_name', ['emergency', 'sinking']);

export const accounts = pgTable(
  'accounts',
  {
    ...syncColumns(),
    name: text('name').notNull(),
    type: accountTypeEnum('type').notNull(),
    openingBalancePaise: bigint('opening_balance_paise', { mode: 'number' }).notNull().default(0),
    isEmergencyFund: boolean('is_emergency_fund').notNull().default(false),
  },
  (table) => [uniqueIndex('accounts_name_unique').on(table.name)]
);

export const categories = pgTable(
  'categories',
  {
    ...syncColumns(),
    name: text('name').notNull(),
    // Null for "Uncategorised" — it belongs to no group (PRD §4.2 seed table shows "—").
    group: categoryGroupEnum('group'),
    // Null for categories funded ad hoc / "from sinking fund" rather than a fixed monthly figure.
    monthlyBudgetPaise: bigint('monthly_budget_paise', { mode: 'number' }),
    // False for "Uncategorised" too: an uncategorised transaction is never assumed to be
    // spending until the user says otherwise (SKILL.md category rules).
    isSpending: boolean('is_spending').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [uniqueIndex('categories_name_unique').on(table.name)]
);

export const categoryAliases = pgTable(
  'category_aliases',
  {
    ...syncColumns(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    alias: text('alias').notNull(),
  },
  (table) => [uniqueIndex('category_aliases_alias_unique').on(table.alias)]
);

export const transactions = pgTable('transactions', {
  ...syncColumns(),
  // YYYY-MM-DD local-time string, never a timestamp (SKILL.md conventions).
  date: date('date', { mode: 'string' }).notNull(),
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  direction: transactionDirectionEnum('direction').notNull(),
  description: text('description').notNull(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id),
  note: text('note'),
  isExcluded: boolean('is_excluded').notNull().default(false),
  source: transactionSourceEnum('source').notNull(),
  importHash: text('import_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rules = pgTable('rules', {
  ...syncColumns(),
  matchText: text('match_text').notNull(),
  matchField: text('match_field').notNull().default('description'),
  amountMinPaise: bigint('amount_min_paise', { mode: 'number' }),
  amountMaxPaise: bigint('amount_max_paise', { mode: 'number' }),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id),
  priority: integer('priority').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const monthlyPlans = pgTable(
  'monthly_plans',
  {
    ...syncColumns(),
    yearMonth: text('year_month').notNull(), // YYYY-MM
    salaryPaise: bigint('salary_paise', { mode: 'number' }).notNull(),
    sipAmountPaise: bigint('sip_amount_paise', { mode: 'number' }).notNull(),
    emergencyTransferPaise: bigint('emergency_transfer_paise', { mode: 'number' }).notNull(),
    sinkingTransferPaise: bigint('sinking_transfer_paise', { mode: 'number' }).notNull(),
    status: monthlyPlanStatusEnum('status').notNull().default('open'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('monthly_plans_year_month_live_unique')
      .on(table.yearMonth)
      .where(sql`${table.deletedAt} is null`),
  ]
);

export const planLines = pgTable('plan_lines', {
  ...syncColumns(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => monthlyPlans.id),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id),
  plannedAmountPaise: bigint('planned_amount_paise', { mode: 'number' }).notNull(),
  // Snapshotted at month-end close (phase 10); null until then.
  actualAmountPaise: bigint('actual_amount_paise', { mode: 'number' }),
});

export const commitments = pgTable('commitments', {
  ...syncColumns(),
  direction: commitmentDirectionEnum('direction').notNull(),
  counterparty: text('counterparty').notNull(),
  description: text('description').notNull(),
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  settledAmountPaise: bigint('settled_amount_paise', { mode: 'number' }).notNull().default(0),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id),
  dueMonth: text('due_month').notNull(), // YYYY-MM
  status: commitmentStatusEnum('status').notNull().default('open'),
  notes: text('notes'),
});

export const commitmentSettlements = pgTable('commitment_settlements', {
  ...syncColumns(),
  commitmentId: uuid('commitment_id')
    .notNull()
    .references(() => commitments.id),
  transactionId: uuid('transaction_id')
    .notNull()
    .references(() => transactions.id),
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  settledOn: date('settled_on', { mode: 'string' }).notNull(),
});

export const fundBuckets = pgTable(
  'fund_buckets',
  {
    ...syncColumns(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    name: fundBucketNameEnum('name').notNull(),
    balancePaise: bigint('balance_paise', { mode: 'number' }).notNull().default(0),
  },
  (table) => [uniqueIndex('fund_buckets_account_name_unique').on(table.accountId, table.name)]
);

// Server-only auth state — never synced to clients, so no sync columns.
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  deviceId: text('device_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});
