'use client';

import { useSyncExternalStore } from 'react';

/**
 * Long refreshes (wallet sync, exchange sync) run here, outside React transitions and component
 * lifetimes: the user can open other pages while they run, and any button for the same task shows
 * it as running when the user comes back. A task with the same key is not started twice.
 */
const running = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function runInBackground(key: string, task: () => Promise<void>): void {
  if (running.has(key)) return;
  running.add(key);
  emit();
  void task()
    .catch(() => {})
    .finally(() => {
      running.delete(key);
      emit();
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBackgroundTask(key: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => running.has(key),
    () => false,
  );
}
