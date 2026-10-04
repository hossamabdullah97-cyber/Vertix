'use client';

/**
 * Registers the service worker (public/sw.js) once per page load; quiet when
 * the browser has none. Kept apart from lib/pwa.ts so the public card can
 * register it without carrying the signed-in app's code.
 */
let registration: Promise<ServiceWorkerRegistration | null> | null = null;
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null);
  registration ??= navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
  return registration;
}

/**
 * Asks the service worker to keep this page and what it loaded, so it opens
 * again without a signal (sw.js keeps only card pages and "Met someone").
 * The first visit arrives before the worker runs, so the page hands over the
 * list itself.
 */
export function keepThisPage(extra: string[] = []): void {
  void registerServiceWorker()
    .then((reg) => (reg ? navigator.serviceWorker.ready : null))
    .then((reg) => {
      const loaded = performance.getEntriesByType('resource').map((r) => r.name);
      reg?.active?.postMessage({ type: 'keep-card', urls: [window.location.href, ...extra, ...loaded] });
    })
    .catch(() => undefined);
}
