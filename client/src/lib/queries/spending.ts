import type { Category } from '../categories';
import type { Transaction } from '../transactions';

/**
 * SKILL.md hard rule 2: every spending query carries all three filters —
 * direction = debit, is_excluded = false, category.is_spending = true.
 * (Soft-deleted rows never reach here: listTransactions() already drops
 * them.) This is the only place that test lives; every screen that reports
 * a spending total calls through here rather than re-deriving it.
 */
export function isSpendingTransaction(
  tx: Transaction,
  categoriesById: Map<string, Category>
): boolean {
  if (tx.direction !== 'debit') return false;
  if (tx.isExcluded) return false;
  const category = categoriesById.get(tx.categoryId);
  return category?.isSpending ?? false;
}

/** Sum of spending transactions in `yearMonth`, per category. */
export function spendingByCategoryForMonth(
  transactions: Transaction[],
  categories: Category[],
  yearMonth: string
): Map<string, number> {
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.date.slice(0, 7) !== yearMonth) continue;
    if (!isSpendingTransaction(tx, categoriesById)) continue;
    totals.set(tx.categoryId, (totals.get(tx.categoryId) ?? 0) + tx.amountPaise);
  }
  return totals;
}

/**
 * Count of transactions landed in the "Uncategorised" category this month —
 * deliberately not filtered by direction/excluded like spending, since the
 * point is to nag about every stray row regardless of what it'll turn out
 * to be (SKILL.md: never assume an uncategorised row is spending).
 */
export function uncategorisedCountForMonth(
  transactions: Transaction[],
  categories: Category[],
  yearMonth: string
): number {
  const uncategorised = categories.find((c) => c.name === 'Uncategorised');
  if (!uncategorised) return 0;
  return transactions.filter(
    (tx) => tx.date.slice(0, 7) === yearMonth && tx.categoryId === uncategorised.id
  ).length;
}
