import { useCallback, useEffect, useState } from 'react';
import { listAccounts, type Account } from '../../lib/accounts';
import { listCategories, type Category } from '../../lib/categories';
import { listTransactions, type Transaction } from '../../lib/transactions';
import { useSyncStore } from '../../store/syncStore';
import { QuickAddRow } from './QuickAddRow';
import { TransactionList } from './TransactionList';
import { TransactionForm } from './TransactionForm';

type FormState = { mode: 'add' } | { mode: 'edit'; transaction: Transaction } | null;

export function TransactionsScreen({ accessToken }: { accessToken: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [formState, setFormState] = useState<FormState>(null);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  const refresh = useCallback(async () => {
    const [cats, accs, txs] = await Promise.all([
      listCategories(),
      listAccounts(),
      listTransactions(),
    ]);
    setCategories(cats);
    setAccounts(accs);
    setTransactions(txs);
  }, []);

  // Re-read after every pull too — a sync can bring in rows from another
  // device that this screen has never seen (SKILL.md: local data first).
  useEffect(() => {
    void refresh();
  }, [refresh, lastSyncedAt]);

  return (
    <div className="transactions-screen">
      <QuickAddRow
        categories={categories}
        accounts={accounts}
        accessToken={accessToken}
        refreshKey={lastSyncedAt}
        onAdded={() => void refresh()}
      />

      <button
        type="button"
        className="add-transaction-button"
        onClick={() => setFormState({ mode: 'add' })}
      >
        + Add transaction
      </button>

      <TransactionList
        transactions={transactions}
        categories={categories}
        accessToken={accessToken}
        onEdit={(transaction) => setFormState({ mode: 'edit', transaction })}
        onMutated={() => void refresh()}
      />

      {formState && (
        <div className="modal-backdrop" onClick={() => setFormState(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <TransactionForm
              categories={categories}
              accounts={accounts}
              accessToken={accessToken}
              editing={formState.mode === 'edit' ? formState.transaction : undefined}
              onSaved={() => {
                setFormState(null);
                void refresh();
              }}
              onCancel={() => setFormState(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
