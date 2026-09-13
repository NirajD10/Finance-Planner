import { useEffect, useState, type FormEvent } from 'react';
import { listCategories, type Category } from '../../lib/categories';
import {
  getPlanForMonth,
  listPlanLines,
  copyPlanFromMonth,
  saveMonthlyPlan,
  type SavePlanInput,
} from '../../lib/monthlyPlan';
import { shiftYearMonth, monthLabel } from '../../lib/month';
import { paiseToRupees, rupeesToPaise } from '../../lib/money';

interface MonthlyPlanEditorProps {
  yearMonth: string;
  accessToken: string;
  onSaved: () => void;
  onCancel: () => void;
}

function draftFieldRupees(paise: number): string {
  return paise === 0 ? '' : String(paiseToRupees(paise));
}

export function MonthlyPlanEditor({
  yearMonth,
  accessToken,
  onSaved,
  onCancel,
}: MonthlyPlanEditorProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<SavePlanInput | null>(null);
  const [hasExistingPlan, setHasExistingPlan] = useState(false);
  const [previousMonthHasPlan, setPreviousMonthHasPlan] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const previousMonth = shiftYearMonth(yearMonth, -1);
      const [cats, existingPlan, previousDraft] = await Promise.all([
        listCategories(),
        getPlanForMonth(yearMonth),
        copyPlanFromMonth(previousMonth, yearMonth),
      ]);
      if (cancelled) return;

      // SIP / emergency / sinking transfer categories also carry a default
      // monthlyBudgetPaise, but their actual monthly amount lives in this
      // plan's own salary/SIP/emergency/sinking fields above, not as a plan
      // line — and they aren't spending categories, so they don't belong on
      // the dashboard's category cards either.
      const budgeted = cats.filter((c) => c.monthlyBudgetPaise != null && c.isSpending);
      setCategories(budgeted);
      setPreviousMonthHasPlan(previousDraft !== undefined);

      if (existingPlan) {
        const lines = await listPlanLines(existingPlan.id);
        if (cancelled) return;
        setDraft({
          yearMonth,
          salaryPaise: existingPlan.salaryPaise,
          sipAmountPaise: existingPlan.sipAmountPaise,
          emergencyTransferPaise: existingPlan.emergencyTransferPaise,
          sinkingTransferPaise: existingPlan.sinkingTransferPaise,
          lines: lines.map((line) => ({
            categoryId: line.categoryId,
            plannedAmountPaise: line.plannedAmountPaise,
          })),
        });
        setHasExistingPlan(true);
      } else {
        setDraft({
          yearMonth,
          salaryPaise: 0,
          sipAmountPaise: 0,
          emergencyTransferPaise: 0,
          sinkingTransferPaise: 0,
          lines: budgeted.map((c) => ({
            categoryId: c.id,
            plannedAmountPaise: c.monthlyBudgetPaise ?? 0,
          })),
        });
        setHasExistingPlan(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [yearMonth]);

  function lineAmountPaise(categoryId: string): number {
    return draft?.lines.find((line) => line.categoryId === categoryId)?.plannedAmountPaise ?? 0;
  }

  function setLineAmountPaise(categoryId: string, amountPaise: number) {
    setDraft((current) => {
      if (!current) return current;
      const exists = current.lines.some((line) => line.categoryId === categoryId);
      const lines = exists
        ? current.lines.map((line) =>
            line.categoryId === categoryId ? { ...line, plannedAmountPaise: amountPaise } : line
          )
        : [...current.lines, { categoryId, plannedAmountPaise: amountPaise }];
      return { ...current, lines };
    });
  }

  async function handleCopyFromLastMonth() {
    const previous = await copyPlanFromMonth(shiftYearMonth(yearMonth, -1), yearMonth);
    if (previous) setDraft(previous);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    try {
      await saveMonthlyPlan(draft, accessToken);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (!draft) return <p>Loading…</p>;

  return (
    <form className="plan-form" onSubmit={handleSubmit}>
      <h2>{monthLabel(yearMonth)} plan</h2>

      <div className="plan-form-grid">
        <label>
          Salary
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={draftFieldRupees(draft.salaryPaise)}
            onChange={(e) =>
              setDraft({ ...draft, salaryPaise: rupeesToPaise(Number(e.target.value)) })
            }
          />
        </label>
        <label>
          SIP
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={draftFieldRupees(draft.sipAmountPaise)}
            onChange={(e) =>
              setDraft({ ...draft, sipAmountPaise: rupeesToPaise(Number(e.target.value)) })
            }
          />
        </label>
        <label>
          Emergency transfer
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={draftFieldRupees(draft.emergencyTransferPaise)}
            onChange={(e) =>
              setDraft({ ...draft, emergencyTransferPaise: rupeesToPaise(Number(e.target.value)) })
            }
          />
        </label>
        <label>
          Sinking transfer
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={draftFieldRupees(draft.sinkingTransferPaise)}
            onChange={(e) =>
              setDraft({ ...draft, sinkingTransferPaise: rupeesToPaise(Number(e.target.value)) })
            }
          />
        </label>
      </div>

      <div>
        <div className="plan-section-title">Category budgets</div>
        {categories.map((category) => (
          <div className="plan-line-row" key={category.id}>
            <span className="plan-line-name">{category.name}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={draftFieldRupees(lineAmountPaise(category.id))}
              onChange={(e) =>
                setLineAmountPaise(category.id, rupeesToPaise(Number(e.target.value)))
              }
            />
          </div>
        ))}
      </div>

      <div className="plan-form-footer">
        {previousMonthHasPlan ? (
          <button type="button" className="link-button" onClick={() => void handleCopyFromLastMonth()}>
            Copy from last month
          </button>
        ) : (
          <span />
        )}
        <div className="form-actions">
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : hasExistingPlan ? 'Update plan' : 'Create plan'}
          </button>
        </div>
      </div>
    </form>
  );
}
