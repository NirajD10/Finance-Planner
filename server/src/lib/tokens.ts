import { createHash } from 'crypto';

// Refresh tokens are high-entropy opaque strings, not JWTs: revocation needs
// a DB lookup regardless, so a stateless JWT would buy nothing here (PRD §7.8 /
// SKILL.md — "a stateless-only refresh token cannot be revoked").
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function generateRefreshToken(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}

// Hashed before storage so a DB read alone doesn't hand over a live session.
// SHA-256 (not argon2) is fine here: the token is already high-entropy random
// data, not a low-entropy human password.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
