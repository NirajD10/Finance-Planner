import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { runSync } from './syncEngine';

const WRITE_DEBOUNCE_MS = 2000;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Call after every local write. Debounced, not fired on every keystroke —
 * a burst of edits results in one sync, not one per edit. This one-shot
 * timeout is the only timer in this module — there is deliberately no
 * recurring polling loop anywhere here (PLAN.md phase 2 "done when":
 * no timer-based sync).
 */
export function scheduleSyncAfterWrite(accessToken: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void runSync(accessToken);
  }, WRITE_DEBOUNCE_MS);
}

/**
 * Wires the two event-driven triggers from PLAN.md phase 2 (foreground and
 * reconnect) plus exposes scheduleSyncAfterWrite/manual refresh for
 * everything else. Returns a cleanup function.
 */
export function setupSyncTriggers(getAccessToken: () => string | undefined): () => void {
  const triggerIfAuthed = () => {
    const token = getAccessToken();
    if (token) void runSync(token);
  };

  const cleanupFns: (() => void)[] = [];

  if (Capacitor.isNativePlatform()) {
    const handle = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) triggerIfAuthed();
    });
    cleanupFns.push(() => void handle.then((listener) => listener.remove()));
  } else {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') triggerIfAuthed();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    cleanupFns.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));
  }

  window.addEventListener('online', triggerIfAuthed);
  cleanupFns.push(() => window.removeEventListener('online', triggerIfAuthed));

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const cleanup of cleanupFns) cleanup();
  };
}
