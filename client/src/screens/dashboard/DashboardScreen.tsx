import { useCallback, useEffect, useState } from 'react';
import { listCategories, type Category } from '../../lib/categories';
import { listTransactions, type Transaction } from '../../lib/transactions';
import {
  getPlanForMonth,
  listPlanLines,
  type MonthlyPlan,
  type PlanLine,
} from '../../lib/monthlyPlan';
import { currentYearMonth, shiftYearMonth, daysLeftInMonth, monthLabel } from '../../lib/month';
import { spendingByCategoryForMonth, uncategorisedCountForMonth } from '../../lib/queries/spending';
import { formatPaise } from '../../lib/money';
import { useSyncStore } from '../../store/syncStore';
import { MonthlyPlanEditor } from '../plan/MonthlyPlanEditor';

interface CategoryRowData {
  category: Category;
  plannedAmountPaise: number;
  spentPaise: number;
  remainingPaise: number;
  percentSpent: number;
}

function thresholdClass(percentSpent: number): 'good' | 'warn' | 'over' {
  if (percentSpent > 100) return 'over';
  if (percentSpent >= 70) return 'warn';
  return 'good';
}

export function DashboardScreen({ accessToken }: { accessToken: string }) {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [plan, setPlan] = useState<MonthlyPlan | null>(null);
  const [lines, setLines] = useState<PlanLine[]>([]);
  const [editing, setEditing] = useState(false);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  const refresh = useCallback(async () => {
    const [cats, txs, monthPlan] = await Promise.all([
      listCategories(),
      listTransactions(),
      getPlanForMonth(yearMonth),
    ]);
    setCategories(cats);
    setTransactions(txs);
    setPlan(monthPlan ?? null);
    setLines(monthPlan ? await listPlanLines(monthPlan.id) : []);
  }, [yearMonth]);

  useEffect(() => {
    void refresh();
  }, [refresh, lastSyncedAt]);

  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const spending = spendingByCategoryForMonth(transactions, categories, yearMonth);
  const uncategorisedCount = uncategorisedCountForMonth(transactions, categories, yearMonth);
  const daysLeft = daysLeftInMonth(yearMonth);

  const rows: CategoryRowData[] = lines
    .map((line) => {
      const category = categoriesById.get(line.categoryId);
      if (!category) return null;
      const spentPaise = spending.get(line.categoryId) ?? 0;
      const remainingPaise = line.plannedAmountPaise - spentPaise;
      const percentSpent =
        line.plannedAmountPaise > 0 ? (spentPaise / line.plannedAmountPaise) * 100 : 0;
      return {
        category,
        plannedAmountPaise: line.plannedAmountPaise,
        spentPaise,
        remainingPaise,
        percentSpent,
      };
    })
    .filter((row): row is CategoryRowData => row !== null)
    .sort((a, b) => a.category.sortOrder - b.category.sortOrder);

  const safeToSpendPaise = rows.reduce((sum, row) => sum + row.remainingPaise, 0);

  return (
    <div className="dashboard">
      <div className="month-switcher">
        <button
          type="button"
          onClick={() => setYearMonth((ym) => shiftYearMonth(ym, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="month-switcher-label">{monthLabel(yearMonth)}</span>
        <button
          type="button"
          onClick={() => setYearMonth((ym) => shiftYearMonth(ym, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {!plan ? (
        <div className="dashboard-empty">
          <h2>No plan for {monthLabel(yearMonth)} yet</h2>
          <p>Set salary, savings transfers, and category budgets to see what&apos;s safe to spend.</p>
          <button type="button" className="dashboard-empty-cta" onClick={() => setEditing(true)}>
            Set up this month&apos;s plan
          </button>
        </div>
      ) : (
        <>
          <div className="dashboard-hero">
            {daysLeft !== null && (
              <p className="dashboard-hero-days">
                {daysLeft} day{daysLeft === 1 ? '' : 's'} left
              </p>
            )}
            <p className="dashboard-hero-label">
              {safeToSpendPaise < 0 ? 'Over budget by' : 'Safe to spend'}
            </p>
            <span className={`dashboard-hero-amount ${safeToSpendPaise < 0 ? 'over' : ''}`}>
              {formatPaise(Math.abs(safeToSpendPaise))}
            </span>
            {uncategorisedCount > 0 && (
              <p className="uncategorised-flag">
                {uncategorisedCount} uncategorised transaction{uncategorisedCount === 1 ? '' : 's'}{' '}
                this month
              </p>
            )}
          </div>

          <div className="category-ledger">
            {rows.map((row) => {
              const cls = thresholdClass(row.percentSpent);
              // Once a category is over budget there's nothing left to
              // spread across the remaining days, so the figure would just
              // read as a confusing negative "-₹X/day" — omit it instead.
              const perDayPaise =
                daysLeft && daysLeft > 0 && row.remainingPaise >= 0
                  ? Math.round(row.remainingPaise / daysLeft)
                  : null;
              return (
                <div className="category-row" key={row.category.id}>
                  <div className="category-row-top">
                    <span className="category-name">{row.category.name}</span>
                    <span className="category-figures">
                      <strong>{formatPaise(row.spentPaise)}</strong> /{' '}
                      {formatPaise(row.plannedAmountPaise)}
                    </span>
                  </div>
                  <div className="ledger-bar">
                    <div
                      className={`ledger-bar-fill ${cls}`}
                      style={{ width: `${Math.min(100, Math.max(0, row.percentSpent))}%` }}
                    />
                  </div>
                  <div className="category-row-bottom">
                    <span className="stat">
                      <strong>{formatPaise(Math.abs(row.remainingPaise))}</strong>{' '}
                      {row.remainingPaise < 0 ? 'over' : 'left'}
                    </span>
                    {perDayPaise !== null && (
                      <span className="stat">
                        <strong>{formatPaise(perDayPaise)}</strong>/day
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="dashboard-footer">
            <button type="button" className="link-button" onClick={() => setEditing(true)}>
              Edit this month&apos;s plan
            </button>
          </div>
        </>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <MonthlyPlanEditor
              yearMonth={yearMonth}
              accessToken={accessToken}
              onSaved={() => {
                setEditing(false);
                void refresh();
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
