import { cors } from '@elysiajs/cors';

const allowlist = [
  Bun.env.WEB_ORIGIN,
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
].filter(Boolean) as string[];

export const corsMiddleware = cors({
  origin: allowlist,
  credentials: true,
});
