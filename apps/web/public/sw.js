/*
 * Vertex Connect service worker: notifications on the lock screen (Web Push),
 * a page to show instead of the browser's error when the phone is offline,
 * and the cards a visitor has opened, so a card still opens (and its contact
 * still saves) after the signal goes, at a crowded stand or in a basement
 * hall. Everything is fetched from the network first: what is kept is only
 * served when the network fails, so nobody sees a stale card while online.
 */
const SHELL = 'vertex-shell-v3';
const CARDS = 'vertex-cards-v1';
const OFFLINE = '/offline.html';
/** Cards are small; this keeps a busy event's worth without filling the phone. */
const MAX_KEPT = 300;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll([OFFLINE])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== CARDS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** A card page (/c/slug), its contact file, or the "Met someone" screen. */
const isCardPage = (url) => /^\/c\/[^/]+\/?$/.test(url.pathname) || url.pathname === '/meet';
const isContactFile = (url) => /^\/c\/[^/]+\/contact\.vcf$/.test(url.pathname);
/**
 * The build's own files, and the app's translations: their names (or their
 * ?v=) change with their content, so a kept copy is never stale.
 */
const isBuildFile = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/fonts/') || (url.pathname.startsWith('/i18n/') && url.searchParams.has('v')));
/** Requested by a card page (its scripts, styles, photos). */
const forCard = (request) => {
  try {
    return isCardPage(new URL(request.referrer));
  } catch {
    return false;
  }
};

/**
 * Keeps a response. The body is read in full first: a card page streams, and
 * handing the cache a stream that is cut off (the signal drops mid-page) fails
 * the write and can take the copy already kept with it.
 */
async function keep(request, response) {
  if (!response || !(response.ok || response.type === 'opaque')) return;
  if (response.type !== 'opaque') {
    const body = await response.blob();
    response = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const cache = await caches.open(CARDS);
  await cache.put(request, response);
  const keys = await cache.keys();
  // Oldest first: the ones kept longest ago go.
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_KEPT))) await cache.delete(old);
}

async function fromKept(request) {
  return (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true }));
}

/** The network, keeping a copy; the kept copy when the network fails. */
async function networkFirst(event, fallback) {
  try {
    const response = await fetch(event.request);
    event.waitUntil(keep(event.request, response.clone()).catch(() => undefined));
    return response;
  } catch (err) {
    const kept = await fromKept(event.request);
    if (kept) return kept;
    if (fallback) return (await caches.match(fallback)) || Response.error();
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // The contact file first: tapping "Save contact" is a navigation too.
  if (url.origin === self.location.origin && isContactFile(url)) return event.respondWith(networkFirst(event));
  if (request.mode === 'navigate') {
    if (url.origin === self.location.origin && isCardPage(url)) return event.respondWith(networkFirst(event, OFFLINE));
    // Every other page: from the network, the offline page when there is none.
    return event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
  }
  if (isBuildFile(url)) {
    // Kept for a card: served from the copy (it cannot change); otherwise the network.
    return event.respondWith(
      caches.match(request).then((kept) => kept || (forCard(request) ? networkFirst(event) : fetch(request))),
    );
  }
  if (request.destination === 'image' && forCard(request)) return event.respondWith(networkFirst(event));
});

/**
 * A card page asks for itself and what it loaded to be kept: on the very
 * first visit the page arrived before this worker was running, so nothing
 * of it went through the fetch handler above.
 */
/** Addresses being kept right now, so two pages asking at once fetch each once. */
const keeping = new Set();
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'keep-card' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    Promise.all(
      data.urls.slice(0, 80).map(async (u) => {
        let mine;
        try {
          const url = new URL(u, self.location.origin);
          if (url.origin === self.location.origin && !(isCardPage(url) || isContactFile(url) || isBuildFile(url))) return;
          const href = url.href;
          if (keeping.has(href) || (await caches.match(href))) return;
          keeping.add((mine = href));
          const response = await fetch(href, url.origin === self.location.origin ? {} : { mode: 'no-cors' });
          await keep(new Request(href), response);
        } catch {
          /* kept next time */
        } finally {
          if (mine) keeping.delete(mine);
        }
      }),
    ),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Vertex Connect';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag,
      // A newer one under the same tag still buzzes.
      renotify: !!data.tag,
      dir: 'auto',
      data: { url: data.url || '/notifications' },
    }),
  );
});

// A tap opens the page it is about: in the app's window if one is open.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/notifications', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        return open.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : self.clients.openWindow(url)));
      }
      return self.clients.openWindow(url);
    }),
  );
});
