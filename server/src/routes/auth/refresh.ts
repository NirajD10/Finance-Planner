import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { sessions } from '../../db/schema';
import { accessJwt } from '../../middleware/auth';
import { generateRefreshToken, hashToken, REFRESH_TOKEN_TTL_MS } from '../../lib/tokens';
import { refreshBodySchema, authTokensSchema, authErrorSchema } from '../../schemas/auth';

export const refreshRoute = new Elysia().use(accessJwt).post(
  '/refresh',
  async ({ body, accessJwt, set }) => {
    const tokenHash = hashToken(body.refreshToken);
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, tokenHash))
      .limit(1);

    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt < now) {
      set.status = 401;
      return { error: 'Invalid or expired refresh token' };
    }

    // Rotate: the presented token is single-use.
    await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, session.id));

    const newRefreshToken = generateRefreshToken();
    await db.insert(sessions).values({
      refreshTokenHash: hashToken(newRefreshToken),
      deviceId: session.deviceId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    });

    const accessToken = await accessJwt.sign({ sub: 'single-user', type: 'access' });
    return { accessToken, refreshToken: newRefreshToken, expiresIn: 15 * 60 };
  },
  {
    body: refreshBodySchema,
    response: { 200: authTokensSchema, 401: authErrorSchema },
  }
);
