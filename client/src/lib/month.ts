// YYYY-MM strings everywhere (SKILL.md conventions) — never derive a month
// from a timestamp inside a query; these helpers are the one place month
// arithmetic happens.

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftYearMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const shifted = new Date(year, month - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

/** Inclusive of today; null for any month other than the current one. */
export function daysLeftInMonth(yearMonth: string): number | null {
  if (yearMonth !== currentYearMonth()) return null;
  const now = new Date();
  return daysInMonth(yearMonth) - now.getDate() + 1;
}

export function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}
