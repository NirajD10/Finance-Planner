// Money is always integer paise (SKILL.md hard rule 1). This is the only
// place rupee<->paise conversion or display formatting happens.
//
// Duplicated in client/src/lib/money.ts until the schema-sharing question
// (SKILL.md "Schema sharing" note) is settled — keep the two in sync.

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function formatPaise(paise: number, locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(paiseToRupees(paise));
}
