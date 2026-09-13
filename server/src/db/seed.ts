// Idempotent: safe to re-run. Existing rows (matched by their unique name/
// alias/account+bucket constraints) are left untouched, not overwritten —
// re-seeding must never clobber budgets or settings the user has since edited.
import { eq } from 'drizzle-orm';
import { db } from './client';
import { accounts, categories, categoryAliases, fundBuckets } from './schema';

const DEVICE_ID = 'server-seed';

const CATEGORY_SEED = [
  { name: 'Petrol', group: 'essential', budgetPaise: 400_00, isSpending: true },
  { name: 'Protein powder', group: 'essential', budgetPaise: 250_00, isSpending: true },
  { name: 'Creatine', group: 'essential', budgetPaise: 50_00, isSpending: true },
  { name: 'Food / snacks', group: 'essential', budgetPaise: 200_00, isSpending: true },
  {
    name: 'Tea + Sutta + Badishep',
    group: 'lifestyle',
    budgetPaise: 200_00,
    isSpending: true,
    aliases: [
      'sutta',
      'tea',
      'chai',
      'badishep',
      'sutta + badishep',
      'sutta + badishep + tea',
      'sutta + badishep + chai',
    ],
  },
  { name: 'Personal / misc', group: 'lifestyle', budgetPaise: 175_00, isSpending: true },
  { name: 'Shopping', group: 'lifestyle', budgetPaise: null, isSpending: true },
  { name: 'Bike accessories & repairs', group: 'lifestyle', budgetPaise: null, isSpending: true },
  { name: 'Trips', group: 'lifestyle', budgetPaise: null, isSpending: true },
  { name: 'Subscriptions', group: 'lifestyle', budgetPaise: 0, isSpending: true },
  { name: 'SIP', group: 'savings', budgetPaise: 500_00, isSpending: false },
  { name: 'Emergency fund transfer', group: 'savings', budgetPaise: 700_00, isSpending: false },
  { name: 'Sinking fund transfer', group: 'savings', budgetPaise: 150_00, isSpending: false },
  { name: 'Transfer between own accounts', group: 'excluded', budgetPaise: null, isSpending: false },
  { name: 'Reimbursement / settlement', group: 'excluded', budgetPaise: null, isSpending: false },
  { name: 'Salary / income', group: 'excluded', budgetPaise: null, isSpending: false },
  { name: 'Uncategorised', group: null, budgetPaise: null, isSpending: false },
] as const;

const ACCOUNT_SEED = [
  { name: 'Primary', type: 'spending', isEmergencyFund: false },
  { name: 'Kotak 811', type: 'savings', isEmergencyFund: true },
] as const;

async function seedCategories() {
  for (const [index, category] of CATEGORY_SEED.entries()) {
    await db
      .insert(categories)
      .values({
        name: category.name,
        group: category.group,
        monthlyBudgetPaise: category.budgetPaise,
        isSpending: category.isSpending,
        sortOrder: index,
        deviceId: DEVICE_ID,
      })
      .onConflictDoNothing({ target: categories.name });
  }

  const teaSuttaBadishep = CATEGORY_SEED.find((c) => c.name === 'Tea + Sutta + Badishep');
  if (!teaSuttaBadishep || !('aliases' in teaSuttaBadishep)) return;

  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, teaSuttaBadishep.name))
    .limit(1);
  if (!category) return;

  for (const alias of teaSuttaBadishep.aliases) {
    await db
      .insert(categoryAliases)
      .values({ categoryId: category.id, alias, deviceId: DEVICE_ID })
      .onConflictDoNothing({ target: categoryAliases.alias });
  }
}

async function seedAccountsAndBuckets() {
  for (const account of ACCOUNT_SEED) {
    await db
      .insert(accounts)
      .values({
        name: account.name,
        type: account.type,
        isEmergencyFund: account.isEmergencyFund,
        deviceId: DEVICE_ID,
      })
      .onConflictDoNothing({ target: accounts.name });
  }

  const [kotak] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.name, 'Kotak 811'))
    .limit(1);
  if (!kotak) return;

  for (const name of ['emergency', 'sinking'] as const) {
    await db
      .insert(fundBuckets)
      .values({ accountId: kotak.id, name, deviceId: DEVICE_ID })
      .onConflictDoNothing({ target: [fundBuckets.accountId, fundBuckets.name] });
  }
}

async function main() {
  await seedCategories();
  await seedAccountsAndBuckets();
  console.log('Seed complete.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
