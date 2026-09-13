import { describe, test, expect } from 'bun:test';
import { syncRoutes } from './sync';

// Route-level: proves the TypeBox schema itself rejects bad input before the
// handler runs (SKILL.md hard rule 8 / testing item 8). Auth is applied one
// level up in index.ts, so it's deliberately not part of this test.
describe('POST /sync validation', () => {
  test('an unknown table name is rejected with 4xx, not a 500', async () => {
    const res = await syncRoutes.handle(
      new Request('http://localhost/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entries: [{ table: 'not_a_real_table', operation: 'upsert', row: { id: 'x' } }],
        }),
      })
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('a row missing required fields is rejected with 4xx, not a 500', async () => {
    const res = await syncRoutes.handle(
      new Request('http://localhost/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entries: [{ table: 'accounts', operation: 'upsert', row: { id: 'not-even-a-uuid' } }],
        }),
      })
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('more than 500 entries in one push is rejected with 4xx', async () => {
    const entries = Array.from({ length: 501 }, () => ({
      table: 'accounts' as const,
      operation: 'upsert' as const,
      row: {
        id: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        deviceId: 'd',
        name: 'x',
        type: 'spending' as const,
        openingBalancePaise: 0,
        isEmergencyFund: false,
      },
    }));

    const res = await syncRoutes.handle(
      new Request('http://localhost/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entries }),
      })
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe('GET /sync validation', () => {
  test('a malformed since query param is rejected with 4xx', async () => {
    const res = await syncRoutes.handle(
      new Request('http://localhost/sync?since=not-a-date')
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('a valid request with no since returns 200 with all ten tables', async () => {
    const res = await syncRoutes.handle(new Request('http://localhost/sync'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    for (const table of [
      'accounts',
      'categories',
      'categoryAliases',
      'transactions',
      'rules',
      'monthlyPlans',
      'planLines',
      'commitments',
      'commitmentSettlements',
      'fundBuckets',
    ]) {
      expect(Array.isArray(body[table])).toBe(true);
    }
  });
});
