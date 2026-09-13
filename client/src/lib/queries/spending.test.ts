import { describe, expect, test } from 'bun:test';
import { spendingByCategoryForMonth, uncategorisedCountForMonth } from './spending';
import type { Category } from '../categories';
import type { Transaction } from '../transactions';

// A fixture month reconciled by hand (SKILL.md testing priority #2 /
// PLAN.md phase 4 "done when": numbers reconcile exactly, and transfers,
// reimbursements, SIP, and savings outflows never appear in spending).

const petrol: Category = {
  id: 'cat-petrol',
  name: 'Petrol',
  group: 'essential',
  monthlyBudgetPaise: 400_00,
  isSpending: true,
  sortOrder: 0,
};
const tea: Category = {
  id: 'cat-tea',
  name: 'Tea + Sutta + Badishep',
  group: 'lifestyle',
  monthlyBudgetPaise: 200_00,
  isSpending: true,
  sortOrder: 1,
};
const sip: Category = {
  id: 'cat-sip',
  name: 'SIP',
  group: 'savings',
  monthlyBudgetPaise: 500_00,
  isSpending: false,
  sortOrder: 2,
};
const transferBetweenOwnAccounts: Category = {
  id: 'cat-transfer',
  name: 'Transfer between own accounts',
  group: 'excluded',
  monthlyBudgetPaise: null,
  isSpending: false,
  sortOrder: 3,
};
const uncategorised: Category = {
  id: 'cat-uncategorised',
  name: 'Uncategorised',
  group: null,
  monthlyBudgetPaise: null,
  isSpending: false,
  sortOrder: 4,
};

const categories = [petrol, tea, sip, transferBetweenOwnAccounts, uncategorised];

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: crypto.randomUUID(),
    date: '2026-09-15',
    amountPaise: 0,
    direction: 'debit',
    description: 'fixture',
    categoryId: petrol.id,
    accountId: 'acc-primary',
    note: null,
    isExcluded: false,
    source: 'manual',
    importHash: null,
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('spendingByCategoryForMonth', () => {
  test('reconciles a hand-calculated month, excluding non-spending rows', () => {
    const transactions: Transaction[] = [
      // Real spending: counts.
      tx({ categoryId: petrol.id, amountPaise: 300_00 }),
      tx({ categoryId: petrol.id, amountPaise: 45_00 }),
      tx({ categoryId: tea.id, amountPaise: 15_00 }),
      tx({ categoryId: tea.id, amountPaise: 20_00 }),

      // A credit in a spending category (e.g. a refund) — never counted.
      tx({ categoryId: petrol.id, amountPaise: 50_00, direction: 'credit' }),

      // Explicitly excluded debit (e.g. a mis-tagged transfer) — never counted.
      tx({ categoryId: petrol.id, amountPaise: 999_00, isExcluded: true }),

      // A savings outflow (SIP) — never spending, regardless of direction/excluded.
      tx({ categoryId: sip.id, amountPaise: 500_00 }),

      // An own-account transfer — excluded group, isSpending false.
      tx({ categoryId: transferBetweenOwnAccounts.id, amountPaise: 2000_00 }),

      // Soft-deleted spending row — must never reach this function at all
      // in the real app (listTransactions() filters it), simulated here by
      // simply not including it in the fixture.

      // A different month entirely — excluded by date.
      tx({ categoryId: petrol.id, amountPaise: 1000_00, date: '2026-08-20' }),
    ];

    const totals = spendingByCategoryForMonth(transactions, categories, '2026-09');

    expect(totals.get(petrol.id)).toBe(345_00);
    expect(totals.get(tea.id)).toBe(35_00);
    expect(totals.has(sip.id)).toBe(false);
    expect(totals.has(transferBetweenOwnAccounts.id)).toBe(false);

    const grandTotal = [...totals.values()].reduce((sum, v) => sum + v, 0);
    expect(grandTotal).toBe(345_00 + 35_00);
  });
});

describe('uncategorisedCountForMonth', () => {
  test('counts every row in Uncategorised this month, regardless of direction', () => {
    const transactions: Transaction[] = [
      tx({ categoryId: uncategorised.id, amountPaise: 100_00 }),
      tx({ categoryId: uncategorised.id, amountPaise: 200_00, direction: 'credit' }),
      tx({ categoryId: petrol.id, amountPaise: 50_00 }),
      tx({ categoryId: uncategorised.id, amountPaise: 10_00, date: '2026-08-01' }),
    ];

    expect(uncategorisedCountForMonth(transactions, categories, '2026-09')).toBe(2);
  });
});
