import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { bearer } from '@elysiajs/bearer';

const JWT_SECRET = Bun.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is not set');

// Access tokens are short-lived stateless JWTs — no DB lookup per request.
// Refresh tokens (server/src/lib/tokens.ts) are the revocable half of the pair.
export const accessJwt = new Elysia().use(
  jwt({
    name: 'accessJwt',
    secret: JWT_SECRET,
    exp: '15m',
  })
);

// Applied via .group() to every protected resource (SKILL.md hard rule 10).
// Never applied to /api/auth/login or /api/auth/refresh.
export const requireAuth = new Elysia()
  .use(bearer())
  .use(accessJwt)
  .onBeforeHandle({ as: 'scoped' }, async ({ bearer, accessJwt, set }) => {
    if (!bearer) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    const payload = await accessJwt.verify(bearer);
    if (!payload || payload.type !== 'access') {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
  });
