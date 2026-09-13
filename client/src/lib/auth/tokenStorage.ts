import { Preferences } from '@capacitor/preferences';

// Preferences is the project's sanctioned storage for tokens (SKILL.md:
// "Tokens only in secure storage (Capacitor Preferences/Keychain-backed on
// device...)"), used here on both native and web rather than ad hoc
// localStorage calls. The access token itself never touches this store —
// it stays in memory only (client/src/store/authStore.ts) and is re-derived
// from the refresh token on app start.
const REFRESH_TOKEN_KEY = 'auth.refreshToken';
const DEVICE_ID_KEY = 'auth.deviceId';

export async function getStoredRefreshToken(): Promise<string | null> {
  const { value } = await Preferences.get({ key: REFRESH_TOKEN_KEY });
  return value;
}

export async function setStoredRefreshToken(token: string): Promise<void> {
  await Preferences.set({ key: REFRESH_TOKEN_KEY, value: token });
}

export async function clearStoredRefreshToken(): Promise<void> {
  await Preferences.remove({ key: REFRESH_TOKEN_KEY });
}

// A stable per-install identifier, used both for the sync protocol's
// device_id column (PRD §5) and to label auth sessions server-side.
export async function getOrCreateDeviceId(): Promise<string> {
  const { value } = await Preferences.get({ key: DEVICE_ID_KEY });
  if (value) return value;

  const deviceId = crypto.randomUUID();
  await Preferences.set({ key: DEVICE_ID_KEY, value: deviceId });
  return deviceId;
}
