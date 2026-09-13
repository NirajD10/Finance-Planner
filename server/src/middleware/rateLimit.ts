import { rateLimit } from 'elysia-rate-limit';

// Caddy always sits in front of this API (server/api has no published port),
// so the immediate TCP peer is the proxy, not the real client — key on the
// forwarded IP instead, matching SKILL.md hard rule 12.
function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export const loginRateLimit = rateLimit({
  scoping: 'scoped',
  duration: 15 * 60 * 1000,
  max: 5,
  generator: (request) => clientIp(request),
  errorResponse: new Response(JSON.stringify({ error: 'Too many login attempts' }), {
    status: 429,
    headers: { 'content-type': 'application/json' },
  }),
});

// Sync runs on foreground/after-write/manual-refresh triggers (no polling),
// but is still internet-facing, so it gets the same protection as login
// (SKILL.md hard rule 12). Generous enough for normal use: foreground +
// debounced writes on a single-user app won't come close to this.
export const syncRateLimit = rateLimit({
  scoping: 'scoped',
  duration: 60 * 1000,
  max: 30,
  generator: (request) => clientIp(request),
  errorResponse: new Response(JSON.stringify({ error: 'Too many sync requests' }), {
    status: 429,
    headers: { 'content-type': 'application/json' },
  }),
});
