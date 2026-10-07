import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { KEYS } from './api';
import { API_BASE } from './config';
import { secrets } from './storage';

/**
 * Errors the app meets, sent to the same place as the website's (the admin
 * console's Errors tab, and an email to whoever runs the platform for a new
 * one). Never in the way: a report that cannot be sent is dropped.
 */

type Kind = 'error' | 'unhandledrejection' | 'react';

let screen: string | null = null;
const sent = new Set<string>();
const MAX_PER_RUN = 20;

/** The screen on show, so a report says where it happened (set by the root layout). */
export function setScreen(path: string) {
  screen = path;
}

const release = () => `app-${Constants.expoConfig?.version ?? '0'}`;

export async function reportError(err: unknown, kind: Kind = 'error'): Promise<void> {
  if (Platform.OS === 'web' || __DEV__) return;
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  const key = `${e.name}:${e.message}`;
  if (sent.has(key) || sent.size >= MAX_PER_RUN) return;
  sent.add(key);
  try {
    const token = await secrets.get(KEYS.token);
    await fetch(`${API_BASE}/telemetry/errors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        kind,
        name: (e.name || 'Error').slice(0, 120),
        message: (e.message || 'Unknown error').slice(0, 1000),
        stack: e.stack?.slice(0, 8000),
        path: screen?.slice(0, 300) ?? undefined,
        release: release(),
        platform: Platform.OS,
      }),
    });
  } catch {
    // Offline, or the server down: nothing to do about it here.
  }
}

/** Every error nothing else caught, reported before the app's own handling (a red screen in development, a restart in a build). */
export function catchUnhandled() {
  const g = globalThis as unknown as {
    ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void };
  };
  const previous = g.ErrorUtils?.getGlobalHandler();
  g.ErrorUtils?.setGlobalHandler((e, fatal) => {
    void reportError(e, 'error');
    previous?.(e, fatal);
  });
}
