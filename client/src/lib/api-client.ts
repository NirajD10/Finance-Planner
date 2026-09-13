import type { OutboxOperation, SyncRow, SyncTableName } from './local/types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export interface HealthResponse {
  status: 'ok';
  db: 'ok';
  timestamp: string;
}

export type SyncPullResponse = { serverTime: string } & Record<SyncTableName, SyncRow[]>;

export interface SyncPushEntry {
  table: SyncTableName;
  operation: OutboxOperation;
  row: SyncRow;
}

export interface SyncPushResponse {
  serverTime: string;
  applied: number;
  skipped: number;
  rejected: { table: string; id: string; error: string }[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.error === 'string' ? body.error : `Request failed: ${res.status}`;
  } catch {
    return `Request failed: ${res.status}`;
  }
}

export async function login(password: string, deviceId: string): Promise<AuthTokens> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, deviceId }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }
  return res.json();
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }
  return res.json();
}

export async function getHealth(accessToken: string): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/api/health`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }
  return res.json();
}

export async function syncPull(accessToken: string, since?: string): Promise<SyncPullResponse> {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  const res = await fetch(`${API_BASE}/api/sync${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }
  return res.json();
}

export async function syncPush(
  accessToken: string,
  entries: SyncPushEntry[]
): Promise<SyncPushResponse> {
  const res = await fetch(`${API_BASE}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }
  return res.json();
}
