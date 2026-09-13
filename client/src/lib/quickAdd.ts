import { getLocalStore } from './local';
import type { Account } from './accounts';
import type { Category } from './categories';

export interface QuickAddButton {
  id: string;
  label: string;
  amountPaise: number;
  categoryId: string;
  accountId: string;
}

// Button config is a per-device UI preference, not one of the nine synced
// tables in PRD §5 — it lives in the local store's meta key/value table
// (already used for lastSyncedAt) rather than a synced table or
// localStorage (SKILL.md: never localStorage for app data).
const META_KEY = 'quickAddButtons';

export async function getQuickAddButtons(): Promise<QuickAddButton[]> {
  const store = await getLocalStore();
  const raw = await store.getMeta(META_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QuickAddButton[]) : [];
  } catch {
    return [];
  }
}

export async function setQuickAddButtons(buttons: QuickAddButton[]): Promise<void> {
  const store = await getLocalStore();
  await store.setMeta(META_KEY, JSON.stringify(buttons));
}

// PRD §4.1 defaults. Seeded once real category/account rows exist locally
// (i.e. after the first sync pull), matched by name the same way the
// server seed script keys categories — never hardcoded UUIDs, which would
// only ever match one particular database.
const DEFAULTS: { label: string; amountPaise: number; categoryName: string }[] = [
  { label: 'Tea', amountPaise: 15_00, categoryName: 'Tea + Sutta + Badishep' },
  { label: 'Sutta', amountPaise: 20_00, categoryName: 'Tea + Sutta + Badishep' },
  { label: 'Badishep', amountPaise: 10_00, categoryName: 'Tea + Sutta + Badishep' },
  { label: 'Petrol', amountPaise: 300_00, categoryName: 'Petrol' },
  { label: 'Snack', amountPaise: 50_00, categoryName: 'Food / snacks' },
];

export async function ensureDefaultQuickAddButtons(
  categories: Category[],
  accounts: Account[]
): Promise<QuickAddButton[]> {
  const existing = await getQuickAddButtons();
  if (existing.length > 0) return existing;

  const primary = accounts.find((a) => a.name === 'Primary');
  if (!primary) return [];

  const buttons: QuickAddButton[] = [];
  for (const preset of DEFAULTS) {
    const category = categories.find((c) => c.name === preset.categoryName);
    if (!category) continue;
    buttons.push({
      id: crypto.randomUUID(),
      label: preset.label,
      amountPaise: preset.amountPaise,
      categoryId: category.id,
      accountId: primary.id,
    });
  }

  if (buttons.length > 0) await setQuickAddButtons(buttons);
  return buttons;
}
