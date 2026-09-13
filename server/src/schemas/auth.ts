import { t } from 'elysia';

export const loginBodySchema = t.Object({
  password: t.String({ minLength: 1 }),
  deviceId: t.String({ minLength: 1 }),
});

export const refreshBodySchema = t.Object({
  refreshToken: t.String({ minLength: 1 }),
});

export const authTokensSchema = t.Object({
  accessToken: t.String(),
  refreshToken: t.String(),
  expiresIn: t.Number(),
});

export const authErrorSchema = t.Object({
  error: t.String(),
});
