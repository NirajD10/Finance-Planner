import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import { corsMiddleware } from './middleware/cors';
import { requireAuth } from './middleware/auth';
import { loginRateLimit, syncRateLimit } from './middleware/rateLimit';
import { healthRoutes } from './routes/health';
import { syncRoutes } from './routes/sync';
import { loginRoute } from './routes/auth/login';
import { refreshRoute } from './routes/auth/refresh';

const app = new Elysia().use(corsMiddleware);

if (Bun.env.NODE_ENV !== 'production') {
  app.use(swagger());
}

app
  .group('/api/auth', (app) =>
    app.use(new Elysia().use(loginRateLimit).use(loginRoute)).use(refreshRoute)
  )
  .group('/api', (app) =>
    app.use(requireAuth).use(healthRoutes).use(new Elysia().use(syncRateLimit).use(syncRoutes))
  )
  .listen(3000);

console.log(`Server running at ${app.server?.hostname}:${app.server?.port}`);
