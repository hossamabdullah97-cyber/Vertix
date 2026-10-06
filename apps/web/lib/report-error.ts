/**
 * Errors the pages meet in people's browsers, sent to the API's
 * /telemetry/errors, where they are grouped for the admin console (and passed
 * to Sentry when it is set up). Small and dependency-free: it is on every
 * page, the public card included.
 */
import { API_URL } from './api';

export type ErrorKind = 'error' | 'unhandledrejection' | 'react';

/** Reports per page load, so a loop of errors cannot flood the API. */
const MAX_REPORTS = 10;
const sent = new Set<string>();
let reports = 0;

/** The build this page came from, to tell one release's errors from the next's. */
const RELEASE = process.env.NEXT_PUBLIC_RELEASE || undefined;

export function describeError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) return { name: err.name || 'Error', message: err.message || String(err), stack: err.stack };
  if (err && typeof err === 'object' && 'message' in err) return { name: 'Error', message: String((err as { message: unknown }).message) };
  return { name: 'Error', message: typeof err === 'string' ? err : (() => { try { return JSON.stringify(err); } catch { return String(err); } })() ?? 'Unknown error' };
}

/** A new release was deployed while the page was open: its old code files are gone. */
export function isStaleChunk(err: { name?: string; message?: string }): boolean {
  return err.name === 'ChunkLoadError' || /Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(err.message ?? '');
}

const RELOADED_KEY = 'vx_stale_reload';

/**
 * After a deploy, a page still open asks for code files that no longer exist.
 * Loading the page again fetches the new ones; this does it once a minute at
 * most, so a real outage does not become a reload loop. True when reloading.
 */
export function reloadForNewRelease(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Whether an error is ours to fix: not an extension's, a cross-origin script's or a cancelled request. */
export function worthReporting(e: { name: string; message: string; stack?: string }): boolean {
  if (!e.message || e.message === 'Script error.' || e.name === 'AbortError') return false;
  if (/ResizeObserver loop/.test(e.message)) return false;
  if (/chrome-extension:|moz-extension:|safari-web-extension:/.test(e.stack ?? '')) return false;
  return true;
}

export function reportError(err: unknown, kind: ErrorKind = 'error'): void {
  if (typeof window === 'undefined') return;
  const e = describeError(err);
  if (!worthReporting(e) || isStaleChunk(e)) return;
  const key = `${kind}|${e.name}|${e.message}`;
  if (sent.has(key) || reports >= MAX_REPORTS) return;
  sent.add(key);
  reports++;
  let token: string | null = null;
  try {
    token = localStorage.getItem('vertex_token');
  } catch {
    // no storage: reported without who it was
  }
  const body = JSON.stringify({
    kind,
    name: e.name.slice(0, 120),
    message: e.message.slice(0, 1000),
    ...(e.stack ? { stack: e.stack.slice(0, 8000) } : {}),
    path: window.location.pathname.slice(0, 300),
    ...(RELEASE ? { release: RELEASE } : {}),
  });
  try {
    void fetch(`${API_URL}/telemetry/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Reporting never adds an error of its own.
  }
}

/** Listens for what nothing else caught, on the window. Returns the way to stop. */
export function watchErrors(): () => void {
  const onError = (ev: ErrorEvent) => {
    const err = ev.error ?? { name: 'Error', message: ev.message };
    if (isStaleChunk(describeError(err)) && reloadForNewRelease()) return;
    reportError(err, 'error');
  };
  const onRejection = (ev: PromiseRejectionEvent) => {
    if (isStaleChunk(describeError(ev.reason)) && reloadForNewRelease()) return;
    reportError(ev.reason, 'unhandledrejection');
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

/** For tests: forget what this page has reported. */
export function resetReports() {
  sent.clear();
  reports = 0;
}
