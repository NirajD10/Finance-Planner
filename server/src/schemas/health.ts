import { t } from 'elysia';

export const healthOkSchema = t.Object({
  status: t.Literal('ok'),
  db: t.Literal('ok'),
  timestamp: t.String(),
});

export const healthErrorSchema = t.Object({
  error: t.String(),
});
