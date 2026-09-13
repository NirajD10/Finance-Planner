import { useSyncStore } from '../../store/syncStore';
import { getLocalStore } from '../local';
import { pullFromServer } from './pull';
import { drainOutbox } from './push';

let inFlight: Promise<void> | null = null;

async function refreshPendingCount(): Promise<void> {
  const store = await getLocalStore();
  const entries = await store.getOutboxEntries();
  useSyncStore.getState().setPendingCount(entries.length);
}

/**
 * Push-then-pull, coalesced: concurrent triggers (e.g. foreground + manual
 * refresh firing together) share a single in-flight run instead of racing
 * two syncs against each other.
 */
export async function runSync(accessToken: string): Promise<void> {
  const { setStatus, setError } = useSyncStore.getState();

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus('offline');
    return;
  }

  if (inFlight) return inFlight;

  setStatus('syncing');
  inFlight = (async () => {
    try {
      await drainOutbox(accessToken);
      await pullFromServer(accessToken);
      await refreshPendingCount();
      useSyncStore.getState().setLastSyncedAt(new Date().toISOString());
      const pending = useSyncStore.getState().pendingCount;
      setStatus(pending > 0 ? 'pending' : 'synced');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
      throw err;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export { refreshPendingCount };
