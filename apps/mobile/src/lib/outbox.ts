import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { activeOrg, api, ApiError } from './api';

/**
 * Changes made without a connection wait here, on this phone, and go out in
 * order once it is back: at a fair the signal comes and goes, and a lead
 * taken down then must not be lost. The same rules as the website's
 * (apps/web/lib/outbox.ts):
 * - anything made while the phone says it is offline waits, since it never left;
 * - a change (PATCH, PUT, DELETE) whose connection failed on the way waits too,
 *   since sending it twice does no harm;
 * - a new record (POST) whose connection failed is not sent again: it may have
 *   arrived, and a second one would be a duplicate.
 * A change the API refuses when it finally arrives is dropped and counted.
 */

export interface Pending {
  id: string;
  path: string;
  method: string;
  /** JSON, or null. */
  body: string | null;
  /** The workspace it was made in, whatever is open when it goes out. */
  orgId: string | null;
  at: number;
}

export type Written<T> = { queued: true } | { queued: false; data: T };

const KEY = 'vertex_outbox';
type State = { pending: number; failed: number; online: boolean; sending: boolean };
let state: State = { pending: 0, failed: 0, online: true, sending: false };
const listeners = new Set<() => void>();
let flushing = false;
let started = false;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

async function readAll(): Promise<Pending[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]') as Pending[];
  } catch {
    return [];
  }
}

async function writeAll(list: Pending[]) {
  if (list.length) await AsyncStorage.setItem(KEY, JSON.stringify(list));
  else await AsyncStorage.removeItem(KEY);
  set({ pending: list.length });
}

async function hold(p: Omit<Pending, 'id' | 'at'>) {
  const entry: Pending = { ...p, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() };
  await writeAll([...(await readAll()), entry]);
}

/**
 * Whether the phone is on a network. Whether Vertex answers there is left to
 * the request itself (a reachability check may ping a site a network blocks),
 * as the website does with navigator.onLine.
 */
export async function isOnline(): Promise<boolean> {
  return (await NetInfo.fetch()).isConnected !== false;
}

/** Whether a waiting change should wait longer rather than be given up. */
export const isTemporary = (err: unknown) => [0, 429, 502, 503, 504].includes((err as { status?: number })?.status ?? -1);

/**
 * A change, sent now if it can be, else kept to send later. Callers show
 * "saved on this phone" for a queued one.
 */
export async function write<T>(path: string, init: { method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'; json?: unknown }): Promise<Written<T>> {
  const keep = async () => {
    await hold({ path, method: init.method, body: init.json === undefined ? null : JSON.stringify(init.json), orgId: await activeOrg() });
    return { queued: true } as const;
  };
  if (!(await isOnline())) return keep();
  try {
    return { queued: false, data: await api<T>(path, init) };
  } catch (e) {
    if (e instanceof ApiError && e.status === 0 && init.method !== 'POST') return keep();
    throw e;
  }
}

/** Sends what is waiting, oldest first; stops at the first one that still cannot get through. */
export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  set({ sending: true });
  try {
    for (;;) {
      const [next] = await readAll();
      if (!next) break;
      try {
        await api(next.path, { method: next.method, ...(next.body !== null ? { json: JSON.parse(next.body) } : {}), orgId: next.orgId });
      } catch (err) {
        if (isTemporary(err)) break;
        set({ failed: state.failed + 1 });
      }
      await writeAll((await readAll()).filter((p) => p.id !== next.id));
    }
  } finally {
    flushing = false;
    set({ sending: false });
  }
}

/** What is waiting now (for signing out: it belongs to this account). */
export async function pendingCount() {
  return (await readAll()).length;
}

export async function clearOutbox() {
  await writeAll([]);
  set({ failed: 0 });
}

export function dismissFailed() {
  set({ failed: 0 });
}

/** Watches the connection: sends what waits when it is back, when the app comes forward, and now and then. */
export function startOutbox() {
  if (started) return;
  started = true;
  void readAll().then((l) => set({ pending: l.length }));
  NetInfo.addEventListener((s) => {
    const online = s.isConnected !== false;
    set({ online });
    if (online && state.pending) void flush();
  });
  AppState.addEventListener('change', (s) => {
    if (s === 'active' && state.pending) void flush();
  });
  // Now and then, whatever the events said (one missed leaves the phone
  // "offline" for good): look again, and send what waits.
  setInterval(() => {
    if (!state.pending && state.online) return;
    void isOnline().then((online) => {
      set({ online });
      if (online && state.pending) void flush();
    });
  }, 20_000);
  // The browser build: the connection's own events, which NetInfo may not pass on.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => {
      set({ online: true });
      if (state.pending) void flush();
    });
    window.addEventListener('offline', () => set({ online: false }));
  }
}

export function useConnection(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
  );
}
