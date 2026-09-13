import { t } from 'elysia';
import * as entities from './entities';

export const syncPullQuerySchema = t.Object({
  since: t.Optional(t.String({ format: 'date-time' })),
});

export const syncPullResponseSchema = t.Object({
  serverTime: t.String({ format: 'date-time' }),
  accounts: t.Array(entities.accountSchema),
  categories: t.Array(entities.categorySchema),
  categoryAliases: t.Array(entities.categoryAliasSchema),
  transactions: t.Array(entities.transactionSchema),
  rules: t.Array(entities.ruleSchema),
  monthlyPlans: t.Array(entities.monthlyPlanSchema),
  planLines: t.Array(entities.planLineSchema),
  commitments: t.Array(entities.commitmentSchema),
  commitmentSettlements: t.Array(entities.commitmentSettlementSchema),
  fundBuckets: t.Array(entities.fundBucketSchema),
});

const outboxOperationSchema = t.Union([t.Literal('upsert'), t.Literal('delete')]);

// A union keyed on `table` so each row is validated against its own shape —
// a plain `t.Record(t.String(), t.Unknown())` would satisfy hard rule 8's
// letter but not its purpose (real per-column validation).
function outboxEntry<Table extends string, RowSchema extends ReturnType<typeof t.Object>>(
  table: Table,
  row: RowSchema
) {
  return t.Object({
    table: t.Literal(table),
    operation: outboxOperationSchema,
    row,
  });
}

export const syncPushBodySchema = t.Object({
  entries: t.Array(
    t.Union([
      outboxEntry('accounts', entities.accountSchema),
      outboxEntry('categories', entities.categorySchema),
      outboxEntry('categoryAliases', entities.categoryAliasSchema),
      outboxEntry('transactions', entities.transactionSchema),
      outboxEntry('rules', entities.ruleSchema),
      outboxEntry('monthlyPlans', entities.monthlyPlanSchema),
      outboxEntry('planLines', entities.planLineSchema),
      outboxEntry('commitments', entities.commitmentSchema),
      outboxEntry('commitmentSettlements', entities.commitmentSettlementSchema),
      outboxEntry('fundBuckets', entities.fundBucketSchema),
    ]),
    { maxItems: 500 }
  ),
});

export const syncPushResponseSchema = t.Object({
  serverTime: t.String({ format: 'date-time' }),
  applied: t.Integer(),
  skipped: t.Integer(),
  rejected: t.Array(
    t.Object({
      table: t.String(),
      id: t.String(),
      error: t.String(),
    })
  ),
});
