'use client';

import { useSyncExternalStore } from 'react';

/**
 * "Deleted · Undo": one offer at a time, shown by the shell (UndoToast) for a
 * few seconds after something is removed. The removal has already happened
 * on the server; undoing asks it back (the API keeps deleted rows long
 * enough, see restore-window.ts). A new offer replaces the one on screen,
 * whose removal simply stands. Kept outside React so it survives a move to
 * another page.
 */
export interface UndoOffer {
  id: number;
  message: string;
  undo: () => Promise<unknown> | unknown;
}

export const UNDO_MS = 6000;

let current: UndoOffer | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function set(next: UndoOffer | null) {
  clearTimeout(timer);
  current = next;
  if (next) timer = setTimeout(() => current?.id === next.id && set(null), UNDO_MS);
  emit();
}

export function offerUndo(message: string, undo: UndoOffer['undo']): void {
  set({ id: ++seq, message, undo });
}

export function dismissUndo(): void {
  set(null);
}

/** Runs the offer's undo once; the toast closes as it starts. Rejects if the undo fails. */
export async function takeUndo(): Promise<void> {
  const offer = current;
  if (!offer) return;
  set(null);
  await offer.undo();
}

export function useUndoOffer(): UndoOffer | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}
