import { useEffect, useRef, useState } from 'react';
import type { Category } from '../../lib/categories';
import type { Account } from '../../lib/accounts';
import {
  ensureDefaultQuickAddButtons,
  getQuickAddButtons,
  setQuickAddButtons,
  type QuickAddButton,
} from '../../lib/quickAdd';
import { createTransaction, todayDateString, type Transaction } from '../../lib/transactions';
import { formatPaise, paiseToRupees, rupeesToPaise } from '../../lib/money';

const LONG_PRESS_MS = 500;

interface QuickAddRowProps {
  categories: Category[];
  accounts: Account[];
  accessToken: string;
  /** Bumping this re-checks for the one-time default seed after a first sync. */
  refreshKey: string | null;
  onAdded: (transaction: Transaction) => void;
}

export function QuickAddRow({ categories, accounts, accessToken, refreshKey, onAdded }: QuickAddRowProps) {
  const [buttons, setButtons] = useState<QuickAddButton[]>([]);
  const [editingAmountFor, setEditingAmountFor] = useState<QuickAddButton | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const existing = await getQuickAddButtons();
      const resolved =
        existing.length > 0 ? existing : await ensureDefaultQuickAddButtons(categories, accounts);
      if (!cancelled) setButtons(resolved);
    }
    void load();
    return () => {
      cancelled = true;
    };
    // refreshKey (lastSyncedAt) intentionally triggers a re-check: categories/
    // accounts only exist locally after the first sync pull completes.
  }, [categories, accounts, refreshKey]);

  async function saveQuickAdd(button: QuickAddButton, amountPaise: number) {
    const tx = await createTransaction(
      {
        date: todayDateString(),
        amountPaise,
        direction: 'debit',
        description: button.label,
        categoryId: button.categoryId,
        accountId: button.accountId,
        note: null,
        isExcluded: false,
        source: 'quickadd',
      },
      accessToken
    );
    onAdded(tx);
  }

  if (buttons.length === 0 && !showSettings) {
    return (
      <div className="quick-add-row">
        <button type="button" onClick={() => setShowSettings(true)}>
          Set up quick-add buttons
        </button>
      </div>
    );
  }

  return (
    <div className="quick-add-section">
      <div className="quick-add-row">
        {buttons.map((button) => (
          <QuickAddButtonView
            key={button.id}
            button={button}
            onTap={() => void saveQuickAdd(button, button.amountPaise)}
            onLongPress={() => setEditingAmountFor(button)}
          />
        ))}
        <button
          type="button"
          className="quick-add-settings-toggle"
          aria-label="Configure quick-add buttons"
          onClick={() => setShowSettings((v) => !v)}
        >
          ⚙
        </button>
      </div>

      {editingAmountFor && (
        <AmountEditModal
          button={editingAmountFor}
          onCancel={() => setEditingAmountFor(null)}
          onConfirm={(amountPaise) => {
            setEditingAmountFor(null);
            void saveQuickAdd(editingAmountFor, amountPaise);
          }}
        />
      )}

      {showSettings && (
        <QuickAddSettings
          buttons={buttons}
          categories={categories}
          accounts={accounts}
          onChange={(next) => {
            setButtons(next);
            void setQuickAddButtons(next);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function QuickAddButtonView({
  button,
  onTap,
  onLongPress,
}: {
  button: QuickAddButton;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const longPressFired = useRef(false);

  function start() {
    longPressFired.current = false;
    timer.current = setTimeout(() => {
      longPressFired.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  }

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
  }

  function end() {
    clearTimer();
    if (!longPressFired.current) onTap();
  }

  return (
    <button
      type="button"
      className="quick-add-button"
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={clearTimer}
      onPointerCancel={clearTimer}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="quick-add-label">{button.label}</span>
      <span className="quick-add-amount">{formatPaise(button.amountPaise)}</span>
    </button>
  );
}

function AmountEditModal({
  button,
  onCancel,
  onConfirm,
}: {
  button: QuickAddButton;
  onCancel: () => void;
  onConfirm: (amountPaise: number) => void;
}) {
  const [amount, setAmount] = useState(String(paiseToRupees(button.amountPaise)));
  const amountPaise = rupeesToPaise(Number(amount));
  const valid = amount.trim().length > 0 && Number.isFinite(amountPaise) && amountPaise > 0;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{button.label}</h3>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <div className="form-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" disabled={!valid} onClick={() => onConfirm(amountPaise)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickAddSettings({
  buttons,
  categories,
  accounts,
  onChange,
  onClose,
}: {
  buttons: QuickAddButton[];
  categories: Category[];
  accounts: Account[];
  onChange: (next: QuickAddButton[]) => void;
  onClose: () => void;
}) {
  function update(id: string, patch: Partial<QuickAddButton>) {
    onChange(buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function remove(id: string) {
    onChange(buttons.filter((b) => b.id !== id));
  }

  function add() {
    if (categories.length === 0 || accounts.length === 0) return;
    onChange([
      ...buttons,
      {
        id: crypto.randomUUID(),
        label: 'New',
        amountPaise: 0,
        categoryId: categories[0].id,
        accountId: accounts[0].id,
      },
    ]);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal quick-add-settings" onClick={(e) => e.stopPropagation()}>
        <h3>Quick-add buttons</h3>
        {buttons.map((button) => (
          <div key={button.id} className="quick-add-settings-row">
            <input
              type="text"
              value={button.label}
              onChange={(e) => update(button.id, { label: e.target.value })}
              aria-label="Label"
            />
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={paiseToRupees(button.amountPaise)}
              onChange={(e) => update(button.id, { amountPaise: rupeesToPaise(Number(e.target.value)) })}
              aria-label="Amount"
            />
            <select
              value={button.categoryId}
              onChange={(e) => update(button.id, { categoryId: e.target.value })}
              aria-label="Category"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={button.accountId}
              onChange={(e) => update(button.id, { accountId: e.target.value })}
              aria-label="Account"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => remove(button.id)} aria-label={`Remove ${button.label}`}>
              ✕
            </button>
          </div>
        ))}
        <div className="form-actions">
          <button type="button" onClick={add}>
            Add button
          </button>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
