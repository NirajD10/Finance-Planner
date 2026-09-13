import { Elysia } from 'elysia';
import { db } from '../../db/client';
import { sessions } from '../../db/schema';
import { accessJwt } from '../../middleware/auth';
import { generateRefreshToken, hashToken, REFRESH_TOKEN_TTL_MS } from '../../lib/tokens';
import { loginBodySchema, authTokensSchema, authErrorSchema } from '../../schemas/auth';

// Rate limiting (SKILL.md hard rule 12) is applied where this route is
// mounted (server/src/index.ts), not here — chaining elysia-rate-limit's
// loosely-typed plugin directly before this .post() breaks Elysia's handler
// type inference (silently widens body/accessJwt/set to `any`).
export const loginRoute = new Elysia().use(accessJwt).post(
    '/login',
    async ({ body, accessJwt, set }) => {
      const expectedHash = Bun.env.AUTH_PASSWORD_HASH;
      if (!expectedHash) {
        set.status = 500;
        return { error: 'Server auth is not configured' };
      }

      // Bun.password.verify throws (rather than resolving false) if
      // expectedHash isn't a recognised hash string at all — e.g. an
      // AUTH_PASSWORD_HASH mangled by a missing \$ escape in .env (Bun's env
      // loader expands unescaped $-sequences). Caught here so a bad env var
      // still degrades to a clean JSON error instead of a raw exception
      // reaching the client (SKILL.md conventions: never leak a raw error).
      let valid: boolean;
      try {
        valid = await Bun.password.verify(body.password, expectedHash);
      } catch {
        set.status = 500;
        return { error: 'Server auth is not configured' };
      }
      if (!valid) {
        set.status = 401;
        return { error: 'Invalid credentials' };
      }

      const now = new Date();
      const refreshToken = generateRefreshToken();
      await db.insert(sessions).values({
        refreshTokenHash: hashToken(refreshToken),
        deviceId: body.deviceId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      });

      const accessToken = await accessJwt.sign({ sub: 'single-user', type: 'access' });
      return { accessToken, refreshToken, expiresIn: 15 * 60 };
    },
    {
      body: loginBodySchema,
      response: {
        200: authTokensSchema,
        401: authErrorSchema,
        429: authErrorSchema,
        500: authErrorSchema,
      },
    }
  );
