import { create } from 'zustand';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'pending' | 'offline' | 'error';

interface SyncStore {
  status: SyncStatus;
  pendingCount: number;
  lastError: string | null;
  lastSyncedAt: string | null;
  setStatus: (status: SyncStatus) => void;
  setError: (message: string) => void;
  setPendingCount: (count: number) => void;
  setLastSyncedAt: (iso: string) => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  status: 'idle',
  pendingCount: 0,
  lastError: null,
  lastSyncedAt: null,
  setStatus: (status) => set({ status, ...(status !== 'error' ? { lastError: null } : {}) }),
  setError: (message) => set({ status: 'error', lastError: message }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
}));
