import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Category } from '../../lib/categories';
import {
  groupByMonth,
  recategoriseTransaction,
  restoreTransaction,
  softDeleteTransaction,
  type Transaction,
} from '../../lib/transactions';
import { formatPaise } from '../../lib/money';

const PAGE_SIZE = 40;
const UNDO_WINDOW_MS = 5000;
const SWIPE_DELETE_THRESHOLD_PX = -72;

interface TransactionListProps {
  transactions: Transaction[];
  categories: Category[];
  accessToken: string;
  onEdit: (transaction: Transaction) => void;
  /** Parent refetches from the local store after any mutation here. */
  onMutated: () => void;
}

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

export function TransactionList({
  transactions,
  categories,
  accessToken,
  onEdit,
  onMutated,
}: TransactionListProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [undo, setUndo] = useState<{ id: string; description: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      const matchesCategory = categoryFilter === 'all' || tx.categoryId === categoryFilter;
      if (!matchesCategory) return false;
      if (q.length === 0) return true;
      return (
        tx.description.toLowerCase().includes(q) || (tx.note ?? '').toLowerCase().includes(q)
      );
    });
  }, [transactions, search, categoryFilter]);

  // Reset pagination when the filters change, without a dedicated effect —
  // an adjustment made during render, not after commit (React's documented
  // "adjusting state when props change" pattern), since this is deriving
  // state from a prop/state change rather than synchronizing an external
  // system (which is what useEffect is for).
  const [appliedFilters, setAppliedFilters] = useState({ search, categoryFilter });
  if (appliedFilters.search !== search || appliedFilters.categoryFilter !== categoryFilter) {
    setAppliedFilters({ search, categoryFilter });
    setVisibleCount(PAGE_SIZE);
  }

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) => Math.min(count + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered.length]);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const visible = filtered.slice(0, visibleCount);
  const groups = useMemo(() => groupByMonth(visible), [visible]);

  async function handleDelete(tx: Transaction) {
    clearTimeout(undoTimer.current);
    await softDeleteTransaction(tx.id, accessToken);
    setUndo({ id: tx.id, description: tx.description });
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
    onMutated();
  }

  async function handleUndo() {
    if (!undo) return;
    clearTimeout(undoTimer.current);
    await restoreTransaction(undo.id, accessToken);
    setUndo(null);
    onMutated();
  }

  async function handleRecategorise(tx: Transaction, categoryId: string) {
    await recategoriseTransaction(tx.id, categoryId, accessToken);
    onMutated();
  }

  return (
    <div className="transaction-list">
      <div className="transaction-list-filters">
        <input
          type="search"
          placeholder="Search description or note"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search transactions"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 && <p className="empty-state">No transactions match.</p>}

      {[...groups.entries()].map(([month, rows]) => (
        <section key={month}>
          <h3 className="month-header">{monthLabel(month)}</h3>
          {rows.map((tx) => (
            <TransactionRow
              key={tx.id}
              transaction={tx}
              category={categoryById.get(tx.categoryId)}
              categories={categories}
              onEdit={() => onEdit(tx)}
              onDelete={() => void handleDelete(tx)}
              onRecategorise={(categoryId) => void handleRecategorise(tx, categoryId)}
            />
          ))}
        </section>
      ))}

      {visibleCount < filtered.length && <div ref={sentinelRef} className="scroll-sentinel" />}

      {undo && (
        <div className="undo-toast" role="status">
          <span>Deleted “{undo.description}”</span>
          <button type="button" onClick={() => void handleUndo()}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

function TransactionRow({
  transaction,
  category,
  categories,
  onEdit,
  onDelete,
  onRecategorise,
}: {
  transaction: Transaction;
  category: Category | undefined;
  categories: Category[];
  onEdit: () => void;
  onDelete: () => void;
  onRecategorise: (categoryId: string) => void;
}) {
  const [dragX, setDragX] = useState(0);
  const dragging = useRef<{ startX: number; pointerId: number } | null>(null);

  function onPointerDown(e: PointerEvent) {
    dragging.current = { startX: e.clientX, pointerId: e.pointerId };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging.current) return;
    const delta = e.clientX - dragging.current.startX;
    setDragX(Math.min(0, delta));
  }

  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = null;
    if (dragX <= SWIPE_DELETE_THRESHOLD_PX) {
      onDelete();
    } else {
      setDragX(0);
    }
  }

  return (
    <div className="transaction-row-wrapper">
      <div className="swipe-delete-hint">Delete</div>
      <div
        className="transaction-row"
        style={{ transform: `translateX(${dragX}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button type="button" className="transaction-row-main" onClick={onEdit}>
          <span className="transaction-description">{transaction.description}</span>
          <span className="transaction-date">{transaction.date}</span>
        </button>
        <select
          className="recategorise-select"
          value={transaction.categoryId}
          onChange={(e) => onRecategorise(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Recategorise"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span
          className={`transaction-amount ${transaction.direction === 'credit' ? 'credit' : 'debit'}`}
        >
          {transaction.direction === 'credit' ? '+' : '-'}
          {formatPaise(transaction.amountPaise)}
        </span>
        {(category?.name ?? 'Uncategorised') === 'Uncategorised' && (
          <span className="uncategorised-badge">Uncategorised</span>
        )}
      </div>
    </div>
  );
}
