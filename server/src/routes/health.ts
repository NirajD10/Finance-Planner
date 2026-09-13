import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { healthOkSchema, healthErrorSchema } from '../schemas/health';

export const healthRoutes = new Elysia().get(
  '/health',
  async ({ set }) => {
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      set.status = 503;
      return { error: 'Database unreachable' };
    }
    return {
      status: 'ok' as const,
      db: 'ok' as const,
      timestamp: new Date().toISOString(),
    };
  },
  {
    response: {
      200: healthOkSchema,
      503: healthErrorSchema,
    },
  }
);
