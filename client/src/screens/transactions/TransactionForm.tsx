import { useState, type FormEvent } from 'react';
import type { Category } from '../../lib/categories';
import type { Account } from '../../lib/accounts';
import {
  createTransaction,
  updateTransaction,
  todayDateString,
  type Transaction,
  type TransactionDirection,
} from '../../lib/transactions';
import { rupeesToPaise, paiseToRupees } from '../../lib/money';

interface TransactionFormProps {
  categories: Category[];
  accounts: Account[];
  accessToken: string;
  /** Present when editing an existing row; absent for a new one. */
  editing?: Transaction;
  onSaved: (transaction: Transaction) => void;
  onCancel: () => void;
}

export function TransactionForm({
  categories,
  accounts,
  accessToken,
  editing,
  onSaved,
  onCancel,
}: TransactionFormProps) {
  const [date, setDate] = useState(editing?.date ?? todayDateString());
  const [amount, setAmount] = useState(
    editing ? String(paiseToRupees(editing.amountPaise)) : ''
  );
  const [direction, setDirection] = useState<TransactionDirection>(editing?.direction ?? 'debit');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? categories[0]?.id ?? '');
  const [accountId, setAccountId] = useState(editing?.accountId ?? accounts[0]?.id ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [isExcluded, setIsExcluded] = useState(editing?.isExcluded ?? false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const amountPaise = rupeesToPaise(Number(amount));
  const canSubmit =
    amount.trim().length > 0 &&
    Number.isFinite(amountPaise) &&
    amountPaise > 0 &&
    description.trim().length > 0 &&
    categoryId.length > 0 &&
    accountId.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const input = {
        date,
        amountPaise,
        direction,
        description: description.trim(),
        categoryId,
        accountId,
        note: note.trim().length > 0 ? note.trim() : null,
        isExcluded,
      };
      const saved = editing
        ? await updateTransaction(editing.id, input, accessToken)
        : await createTransaction({ ...input, source: 'manual' }, accessToken);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save transaction');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="transaction-form" onSubmit={handleSubmit}>
      <label>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>

      <div className="direction-toggle" role="radiogroup" aria-label="Direction">
        <button
          type="button"
          aria-pressed={direction === 'debit'}
          className={direction === 'debit' ? 'active' : ''}
          onClick={() => setDirection('debit')}
        >
          Spent
        </button>
        <button
          type="button"
          aria-pressed={direction === 'credit'}
          className={direction === 'credit' ? 'active' : ''}
          onClick={() => setDirection('credit')}
        >
          Received
        </button>
      </div>

      <label>
        Amount (₹)
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
          required
        />
      </label>

      <label>
        Description
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </label>

      <label>
        Category
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Account
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Note
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={isExcluded}
          onChange={(e) => setIsExcluded(e.target.checked)}
        />
        Excluded from spending
      </label>

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" disabled={!canSubmit || submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
