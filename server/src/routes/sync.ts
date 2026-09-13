import { Elysia } from 'elysia';
import { pullSince, pushEntries } from '../queries/sync';
import {
  syncPullQuerySchema,
  syncPullResponseSchema,
  syncPushBodySchema,
  syncPushResponseSchema,
} from '../schemas/sync';

export const syncRoutes = new Elysia()
  .get(
    '/sync',
    async ({ query }) => {
      const tables = await pullSince(query.since);
      return { serverTime: new Date().toISOString(), ...tables };
    },
    {
      query: syncPullQuerySchema,
      response: { 200: syncPullResponseSchema },
    }
  )
  .post(
    '/sync',
    async ({ body }) => {
      const result = await pushEntries(body.entries);
      return { serverTime: new Date().toISOString(), ...result };
    },
    {
      body: syncPushBodySchema,
      response: { 200: syncPushResponseSchema },
    }
  );
