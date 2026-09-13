import { create } from 'zustand';
import * as api from '../lib/api-client';
import {
  getOrCreateDeviceId,
  getStoredRefreshToken,
  setStoredRefreshToken,
  clearStoredRefreshToken,
} from '../lib/auth/tokenStorage';

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; accessToken: string }
  | { status: 'unauthenticated' };

interface AuthStore {
  auth: AuthState;
  // Called once on app start: silently exchanges a stored refresh token for
  // a fresh access token, so "log in once, never again" actually holds.
  restoreSession: () => Promise<void>;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  auth: { status: 'loading' },

  restoreSession: async () => {
    const refreshToken = await getStoredRefreshToken();
    if (!refreshToken) {
      set({ auth: { status: 'unauthenticated' } });
      return;
    }
    try {
      const tokens = await api.refresh(refreshToken);
      await setStoredRefreshToken(tokens.refreshToken);
      set({ auth: { status: 'authenticated', accessToken: tokens.accessToken } });
    } catch {
      await clearStoredRefreshToken();
      set({ auth: { status: 'unauthenticated' } });
    }
  },

  login: async (password: string) => {
    const deviceId = await getOrCreateDeviceId();
    const tokens = await api.login(password, deviceId);
    await setStoredRefreshToken(tokens.refreshToken);
    set({ auth: { status: 'authenticated', accessToken: tokens.accessToken } });
  },

  logout: async () => {
    await clearStoredRefreshToken();
    set({ auth: { status: 'unauthenticated' } });
  },
}));
