'use client';

import { useSyncExternalStore } from 'react';

/**
 * Changes made without a connection wait here, on this device, and go out in
 * order once it is back: at a fair or on a train a phone drops in and out,
 * and a lead moved or a card edited then should not be lost.
 *
 * What may wait (see client.ts): anything sent while the browser says it is
 * offline, since it never left; and a change (PATCH, PUT, DELETE) whose
 * connection failed on the way, since sending it twice does no harm. A new
 * record (POST) whose connection failed is not retried: it may have arrived.
 *
 * The list is kept in localStorage, so it survives a reload or a closed tab;
 * a page still open when a change goes out gets its answer then. A change the
 * API refuses when it finally arrives (the lead was deleted meanwhile) is
 * dropped and counted as failed.
 */
export interface Pending {
  id: string;
  path: string;
  method: string;
  body: string | null;
  /** The workspace it was made in, whatever is active when it goes out. */
  orgId: string | null;
  at: number;
}

type Send = (p: Pending) => Promise<unknown>;
type Waiter = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

const KEY = 'vertex_outbox';
const waiters = new Map<string, Waiter>();
const listeners = new Set<() => void>();
let send: Send | null = null;
let flushing = false;
let state: { pending: number; failed: number; online: boolean; sending: boolean } = { pending: 0, failed: 0, online: true, sending: false };

function read(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as Pending[];
  } catch {
    return [];
  }
}

function write(list: Pending[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage full or blocked: the change still waits in memory until this page closes */
  }
  set({ pending: list.length });
}

function set(patch: Partial<typeof state>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** Keeps a change to send later; the promise settles when it goes out. */
export function hold(p: Omit<Pending, 'id' | 'at'>): Promise<unknown> {
  const entry: Pending = { ...p, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() };
  write([...read(), entry]);
  return new Promise((resolve, reject) => waiters.set(entry.id, { resolve, reject }));
}

/** Whether a failure means "no connection" rather than "the API said no". */
export const isUnreachable = (err: unknown) => (err as { status?: number })?.status === 0;

/**
 * Whether a waiting change should wait longer rather than be given up: no
 * connection, the API asking to slow down, or the server not there right now
 * (restarting, overloaded). None of these says the change itself was wrong.
 */
export const isTemporary = (err: unknown) => [0, 429, 502, 503, 504].includes((err as { status?: number })?.status ?? -1);

/** Sends what is waiting, oldest first; stops at the first one that still cannot get through. */
export async function flush(): Promise<void> {
  if (flushing || !send) return;
  flushing = true;
  set({ sending: true });
  try {
    for (;;) {
      const [next] = read();
      if (!next) break;
      try {
        const result = await send(next);
        waiters.get(next.id)?.resolve(result);
      } catch (err) {
        if (isTemporary(err)) break;
        waiters.get(next.id)?.reject(err);
        set({ failed: state.failed + 1 });
      }
      waiters.delete(next.id);
      write(read().filter((p) => p.id !== next.id));
    }
  } finally {
    flushing = false;
    set({ sending: false });
  }
}

/** Drops everything waiting (signing out: it belongs to this account). */
export function clearOutbox() {
  write([]);
  waiters.forEach((w) => w.reject(new Error('Signed out')));
  waiters.clear();
}

export function dismissFailed() {
  set({ failed: 0 });
}

/** Starts watching the connection; client.ts hands over how a waiting change is sent. */
export function startOutbox(sender: Send) {
  if (send || typeof window === 'undefined' || typeof window.addEventListener !== 'function' || typeof navigator === 'undefined') return;
  send = sender;
  set({ online: navigator.onLine, pending: read().length });
  window.addEventListener('online', () => {
    set({ online: true });
    void flush();
  });
  window.addEventListener('offline', () => set({ online: false }));
  // navigator.onLine can say "online" on a network that goes nowhere, and a
  // busy server asks to come back later: keep trying now and then.
  setInterval(() => {
    if (state.pending && navigator.onLine) void flush();
  }, 20_000);
  if (state.pending && navigator.onLine) void flush();
}

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function useConnection() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
