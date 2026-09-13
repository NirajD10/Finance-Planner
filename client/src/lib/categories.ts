import { getLocalStore } from './local';
import type { SyncRow } from './local/types';

export type CategoryGroup = 'essential' | 'lifestyle' | 'savings' | 'excluded' | null;

export interface Category {
  id: string;
  name: string;
  group: CategoryGroup;
  monthlyBudgetPaise: number | null;
  isSpending: boolean;
  sortOrder: number;
}

function toCategory(row: SyncRow): Category {
  return {
    id: row.id,
    name: row.name as string,
    group: (row.group as CategoryGroup) ?? null,
    monthlyBudgetPaise: (row.monthlyBudgetPaise as number | null) ?? null,
    isSpending: row.isSpending as boolean,
    sortOrder: row.sortOrder as number,
  };
}

export async function listCategories(): Promise<Category[]> {
  const store = await getLocalStore();
  const rows = await store.getAllRows('categories');
  return rows
    .filter((row) => row.deletedAt == null)
    .map(toCategory)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
