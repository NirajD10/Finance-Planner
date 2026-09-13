import { useSyncStore } from '../store/syncStore';

const LABELS: Record<string, string> = {
  syncing: 'Syncing…',
  synced: 'Synced',
  pending: 'Pending sync',
  offline: 'Offline',
  error: 'Sync error',
};

export function SyncStatusIndicator() {
  const status = useSyncStore((s) => s.status);
  const lastError = useSyncStore((s) => s.lastError);

  const label = LABELS[status];
  if (!label) return null;

  return (
    <p role="status" title={lastError ?? undefined}>
      {label}
    </p>
  );
}
