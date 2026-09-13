---
name: finance-planner
description: Conventions and hard rules for the personal finance planner (React + Vite + Capacitor frontend, Bun + Elysia.js backend, PostgreSQL, self-hosted on Oracle Cloud Compute). Use whenever writing, reviewing, or refactoring any code in this repository - schema changes, Elysia routes, sync logic, money calculations, UI screens, auth, or anything touching the Oracle VM deploy. Also use when adding a new table, a new category, or any feature that touches transaction totals, and for any security-sensitive change.
---

# Finance Planner: Project Conventions

Single-user personal finance app. React + TypeScript + Vite frontend (wrapped by Capacitor for Android), Bun + Elysia.js backend, PostgreSQL, self-hosted on one Oracle Cloud Always Free Compute VM behind Caddy. Read `PRD.md` for product intent and `PLAN.md` for the current phase.

Everything below is a constraint, not a suggestion. The "Hard rules" section produces silently wrong money figures or an actual security hole if violated, which are the two failure modes this project cannot tolerate.

---

## Hard rules — money

### 1. Money is integer paise. Never a float.

```ts
// ✅ Postgres: bigint. SQLite: INTEGER. Both hold paise.
amountPaise: bigint('amount_paise', { mode: 'number' }).notNull()
const total = rows.reduce((s, r) => s + r.amountPaise, 0);

// ❌ never
amount: numeric('amount')
const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
```

Format to rupees only at the render boundary, via `lib/money.ts`. A few paise of drift across 500 transactions destroys trust in every screen.

### 2. Every spending query carries all three filters

```sql
WHERE direction = 'debit'
  AND is_excluded = false        -- transfers, reimbursements, settlements
  AND deleted_at IS NULL         -- soft deletes
  AND category_id IN (SELECT id FROM categories WHERE is_spending = true)
```

This lives once, in `server/queries/spending.ts`, built with Drizzle. Every route that reports a total calls it. If you are about to hand-write a `SUM(amount_paise)` anywhere else, stop.

Transfers between own accounts, reimbursements, trip settlements, salary credits, SIP debits, and emergency/sinking-fund transfers are **never** spending.

### 3. Commitments are not spending

A commitment (money owed in either direction, see PRD §4.10) never appears in any spending total. Only the settling transaction does. If you find yourself summing `commitments.amount_paise` into a month total, stop.

### 4. Sinking fund cannot overdraw

A sinking-fund withdrawal exceeding the bucket balance must fail server-side with a 4xx, and require an explicit user acknowledgement step to touch emergency money instead. Enforce this in the Elysia route, not only the UI — the UI check is a convenience, the API check is the actual control.

---

## Hard rules — sync

### 5. Every table has the four sync columns

```ts
id:        uuid('id').primaryKey(),        // generated CLIENT-side, never a sequence
updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
deletedAt: timestamp('deleted_at', { withTimezone: true }),
deviceId:  text('device_id').notNull(),
```

The client must be able to create a row with a real ID while fully offline.

### 6. Soft deletes only

Never emit `DELETE`. Set `deleted_at`. A hard delete is invisible to the other device, so the row resurrects on the next pull.

### 7. Writes go to the outbox first

Every mutation: write locally → append to outbox → update UI immediately → sync drains the outbox in the background. The UI never awaits the network for a write. A component that shows a save spinner is a bug.

---

## Hard rules — security (VAPT)

Full rationale in PRD §7.8. These are the non-negotiables, checked on every PR that touches a route:

### 8. Every route has a TypeBox schema — no exceptions

```ts
// ✅ every route looks like this
app.post('/api/transactions', async ({ body, user }) => {
  return createTransaction(user.id, body);
}, {
  body: t.Object({
    id: t.String({ format: 'uuid' }),
    date: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
    amountPaise: t.Integer({ minimum: 0 }),
    direction: t.Union([t.Literal('debit'), t.Literal('credit')]),
    categoryId: t.String({ format: 'uuid' }),
  }),
  response: t.Object({ id: t.String() }),
})

// ❌ never — no schema means no validation before the handler runs
app.post('/api/transactions', async ({ body }) => { ... })
```

A route with no `body`/`query`/`params` schema is a route with no input validation. In Elysia that has to be a deliberate omission, and this codebase does not allow it.

### 9. No string-built SQL, ever

Every query goes through Drizzle's query builder. If you find yourself template-literal-interpolating a value into SQL text, stop — that is the entire SQL-injection surface of this app, and it should never exist.

### 10. Every protected route checks auth first, explicitly

One `requireAuth()` guard (an Elysia `derive`/`beforeHandle`), applied to everything under `/api/*` except `/api/auth/login` and `/api/auth/refresh`. Line one of the handler, not buried in logic.

### 11. Secrets never touch the repo

`JWT_SECRET`, `DATABASE_URL`, the Postgres password: `.env`, gitignored, or Docker secrets. Never hardcoded, never logged, never in a commit message or a code comment "for now."

### 12. Rate-limit auth and sync

`/api/auth/login` and `/api/sync` carry `elysia-rate-limit`. Auth brute-force and sync abuse are the two endpoints worth protecting even for a single user, since they're the ones an internet-facing scanner will hit first.

---

## Layout

```
client/                  # React + Vite, wrapped by Capacitor
  src/
    screens/              dashboard/ transactions/ import/ plan/ commitments/ settings/
    lib/
      local/               # SQLite (Capacitor) + Dexie (web) behind ONE interface
      sync/                # outbox, push, pull, merge
      api-client.ts         # the only place fetch() is called
      money.ts              # paise <-> rupee, formatting
      schemas/               # TypeBox, imported from server/schemas via a shared package or copy-build step

server/                  # Bun + Elysia
  src/
    routes/               auth/ sync/ transactions/ categories/ rules/ commitments/ plan/
    db/schema.ts          # Drizzle
    queries/               spending.ts, budget.ts, commitments.ts
    schemas/               # TypeBox, source of truth
    middleware/            auth.ts, rateLimit.ts, cors.ts

deploy/
  docker-compose.yml
  Caddyfile
  .env.example            # never the real .env
```

**Schema sharing:** TypeBox schemas live in `server/schemas/` and are the source of truth. Either publish them as a small local workspace package the client imports, or copy-build them into the client at build time. Never hand-duplicate a schema in both places — that is exactly the kind of drift that produces a client that accepts what the server rejects.

`client/src/lib/local/` exposes one interface implemented twice (SQLite, Dexie). Feature code never knows which platform it's on.

---

## Conventions

- **Dates:** transaction dates are `YYYY-MM-DD` strings in local time, not timestamps. A spend at 11pm belongs to that day. Timestamps are only for `created_at` / `updated_at`.
- **Months:** `YYYY-MM` strings everywhere. Never derive a month from a timestamp in a query.
- **Errors:** Elysia routes return `{ error: string }` with a real status code via `set.status`. Never let a raw Drizzle/Postgres error reach the client — it can leak schema detail.
- **Elysia route style:** one `.post()`/`.get()` per file where routes grow past a handful of lines, grouped by resource under `routes/`. Use Elysia's `.group()` to apply `requireAuth` once per resource rather than per route.
- **CORS:** explicit origin allowlist — your web domain, `capacitor://localhost`, `http://localhost`, `https://localhost`. Never `*`.

---

## Category rules

The tea/cigarette category is **one** category with aliases: `sutta`, `tea`, `chai`, `badishep`, `sutta + badishep`, `sutta + badishep + tea`, `sutta + badishep + chai`. Match case-insensitively on import and collapse into one.

**Junk-value guard:** if an imported category value parses as a number (e.g. `26920.10`), discard it and route the transaction to `Uncategorised`. Those are account balances, not categories. Never create a category from a numeric string.

**Never assume an uncategorised transaction is unnecessary spending.** It is `Uncategorised` until the user says otherwise.

---

## Import

- Dedupe on a hash of `date + amount_paise + normalised description`. Re-importing the same statement must not double-count. Test this explicitly.
- Parse entirely client-side with SheetJS. The statement file must never be uploaded to the server — this is a security property, not just a convenience one.
- The existing `Treatment` column is a *suggestion*: match against category names and aliases, then fall through to the rule engine, then to `Uncategorised`.

---

## Testing

Write tests for these, in this order of importance:

1. Import dedupe (same file twice → same row count)
2. Spending totals excluding transfers, reimbursements, soft-deleted rows, and savings outflows
3. Sync merge: same row edited on two devices, later `updated_at` wins
4. Sync with a soft-deleted row: delete propagates and does not resurrect
5. Commitment settlement: creates exactly one transaction, never double-counts
6. Sinking fund overdraw is rejected by the API even if the UI check is bypassed
7. Paise arithmetic across a 500-row month, asserted to the exact paise
8. A route called with a malformed body returns 4xx from TypeBox validation, not a 500
9. An expired/tampered JWT is rejected on a sample of protected routes, not just one

`bun test`. Do not chase coverage; cover the money paths and the auth boundary.

---

## Do not

- Add a state management library beyond Zustand and TanStack Query
- Add NestJS, Express, Fastify, tRPC, or GraphQL alongside Elysia — pick one backend framework and it's this one
- Add multi-user support, roles, teams, or signup flows. One hardcoded user, credentials set at provisioning time.
- Add a bank API or account-aggregator integration
- Call `fetch()` anywhere in the client except `lib/api-client.ts`
- Use `localStorage` for app data. Dexie on web, SQLite on device. Tokens only in secure storage (Capacitor `Preferences`/Keychain-backed on device, httpOnly-equivalent handling on web).
- Write a route without a TypeBox schema, however small
- Commit a `.env` file, a real JWT secret, or a database credential anywhere, including in comments
- Provision Oracle Autonomous Database for anything in this project — see PRD §7.5 for why
- Build ahead of the current phase in `PLAN.md`

---

## Commands

```bash
# client
cd client && bun run dev          # local dev
bun run build                     # -> dist/, used by both Caddy and Capacitor
npx cap sync android
npx cap open android

# server
cd server && bun run dev          # local dev
bun test
bun run db:generate               # drizzle-kit generate
bun run db:migrate                # apply to Postgres

# deploy (on the VM)
cd deploy && docker compose up -d --build
docker compose logs -f api
```

---

## When the user asks for a new feature

1. Check `PLAN.md`. If it belongs to a later phase, say so and ask whether to proceed anyway.
2. If it touches money totals, state which of the three filters in Hard Rule 2 apply before writing code.
3. If it adds a table, add the four sync columns and extend `/api/sync` in the same change. A table that doesn't sync is a bug that surfaces weeks later.
4. If it adds a route, write the TypeBox schema first, then the handler.
5. If it touches auth, sessions, or anything file-upload-adjacent, re-read PRD §7.8 before writing code.
