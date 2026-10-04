'use client';

/**
 * The installable app and its notifications, on the browser side: the
 * service worker (public/sw.js), the install prompt, and the Web Push
 * subscription the API sends to (PushService).
 */
import { authFetch } from '@/lib/client';

export type PushState =
  /** This server has no push keys, or the browser has no push at all. */
  | 'unavailable'
  /** iPhone/iPad in Safari: push only works once the app is on the home screen. */
  | 'ios-install'
  /** The person said no in the browser's prompt; only the browser's settings can undo it. */
  | 'blocked'
  | 'off'
  | 'on';

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Running as the installed app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Registers the service worker once per page load; quiet when the browser has none. */
let registration: Promise<ServiceWorkerRegistration | null> | null = null;
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null);
  registration ??= navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
  return registration;
}

let serverKey: Promise<string | null> | null = null;
function publicKey(): Promise<string | null> {
  serverKey ??= authFetch<{ publicKey: string | null }>('/notifications/push')
    .then((r) => r.publicKey)
    .catch(() => {
      serverKey = null;
      return null;
    });
  return serverKey;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registerServiceWorker();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Where push stands on this device. */
export async function pushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return (await publicKey()) ? 'ios-install' : 'unavailable';
  if (!pushSupported() || !(await publicKey())) return 'unavailable';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

function keyBytes(base64url: string): ArrayBuffer {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer;
}

/**
 * Asks for permission (from a tap: browsers refuse otherwise), subscribes this
 * device and tells the API, in the language notifications should come in.
 */
export async function enablePush(lang: 'en' | 'ar'): Promise<PushState> {
  const key = await publicKey();
  const reg = await registerServiceWorker();
  if (!key || !reg) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await authFetch('/notifications/push/subscriptions', { method: 'POST', body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, lang }) });
  return 'on';
}

/** Stops notifications on this device. */
export async function disablePush(): Promise<PushState> {
  const sub = await currentSubscription();
  if (sub) {
    await authFetch('/notifications/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return 'off';
}

/**
 * Keeps an existing subscription's language in step with the app's, and the
 * API's record of it alive after a sign-in on a device that already had push on.
 */
export async function syncPush(lang: 'en' | 'ar'): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const sub = await currentSubscription();
  if (!sub) return;
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await authFetch('/notifications/push/subscriptions', { method: 'POST', body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, lang }) }).catch(() => undefined);
}

export function sendTestPush(): Promise<{ sent: number }> {
  return authFetch('/notifications/push/test', { method: 'POST' });
}

/* ---------- install ---------- */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  // Chrome offers to install once; the event is kept so a button can ask later.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    installListeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installListeners.forEach((l) => l());
  });
}

/** Whether a tap can install the app right now (Chrome, Edge, Android). */
export function canPromptInstall(): boolean {
  return !!deferred;
}

export function onInstallChange(listener: () => void): () => void {
  installListeners.add(listener);
  return () => installListeners.delete(listener);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  installListeners.forEach((l) => l());
  return outcome === 'accepted';
}
