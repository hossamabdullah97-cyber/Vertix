'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { authFetch, getActiveOrgId, getToken } from '@/lib/client';
import { formatNumber } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import { LeadAlerts } from '@/components/notifications/LeadAlerts';
import { DevicePush } from '@/components/notifications/DevicePush';
import { CATEGORIES, CATEGORY_ICON, NOTIFS_CHANGED, announceChange, bucketOf, markRead, openNotification, type Bucket, type Notif } from '@/components/notifications/model';

type Tab = 'all' | 'unread' | 'archived';
const TABS: Tab[] = ['all', 'unread', 'archived'];
const PAGE = 30;
const BUCKETS: Bucket[] = ['today', 'yesterday', 'week', 'earlier'];

/**
 * Everything that happened that concerns you: new leads from your cards,
 * changes to the team and to your access, and automation alerts. Each one
 * opens what it is about.
 */
export default function NotificationsPage() {
  const router = useRouter();
  const { t } = useTranslation('notifications');
  const { locale } = useLocale();
  const [tab, setTab] = useState<Tab>('all');
  const [cat, setCat] = useState<string>('all');
  const [items, setItems] = useState<Notif[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const [orgNames, setOrgNames] = useState<Map<string, string>>(new Map());
  const [prefsOpen, setPrefsOpen] = useState(false);

  // The setup checklist links here to open the settings straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('settings') === '1') setPrefsOpen(true);
  }, []);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (tab === 'unread') q.set('unread', 'true');
    if (tab === 'archived') q.set('archived', 'true');
    if (cat !== 'all') q.set('category', cat);
    return q.toString();
  }, [tab, cat]);

  const refreshCount = useCallback(() => {
    authFetch<{ count: number }>('/notifications/unread-count').then((r) => setUnread(r.count)).catch(() => {});
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setItems(null);
      try {
        const rows = await authFetch<Notif[]>(`/notifications${query ? `?${query}` : ''}`);
        setItems(rows);
        setHasMore(rows.length === PAGE);
      } catch {
        setItems([]);
        setHasMore(false);
      }
    },
    [query],
  );

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    refreshCount();
    authFetch<{ org: { id: string; name: string } }[]>('/orgs')
      .then((list) => setOrgNames(new Map(list.map((m) => [m.org.id, m.org.name]))))
      .catch(() => {});
  }, [router, refreshCount]);

  useEffect(() => {
    load();
  }, [load]);

  // Coming back to the tab, or acting in the bell, brings the list up to date.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && (load(true), refreshCount());
    const onChanged = () => refreshCount();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(NOTIFS_CHANGED, onChanged);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(NOTIFS_CHANGED, onChanged);
    };
  }, [load, refreshCount]);

  async function loadMore() {
    const last = items?.[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const rows = await authFetch<Notif[]>(`/notifications?${query ? `${query}&` : ''}cursor=${last.id}`);
      setItems((prev) => [...(prev ?? []), ...rows]);
      setHasMore(rows.length === PAGE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleRead(n: Notif) {
    const read = !n.readAt;
    setItems((list) => (tab === 'unread' && read ? list?.filter((x) => x.id !== n.id) : list?.map((x) => (x.id === n.id ? { ...x, readAt: read ? new Date().toISOString() : null } : x))) ?? list);
    setUnread((c) => Math.max(0, c + (read ? -1 : 1)));
    markRead(n, read).catch(() => load(true));
  }

  function archive(n: Notif) {
    setItems((list) => list?.filter((x) => x.id !== n.id) ?? list);
    if (!n.readAt) setUnread((c) => Math.max(0, c - 1));
    authFetch(`/notifications/${n.id}/archive`, { method: 'PATCH' }).then(announceChange).catch(() => load(true));
  }

  function markAll() {
    setItems((list) => (tab === 'unread' ? [] : list?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() }))) ?? list);
    setUnread(0);
    authFetch('/notifications/read-all', { method: 'POST' }).then(announceChange).catch(() => load(true));
  }

  const open = (n: Notif) => {
    if (!n.readAt && tab !== 'archived') {
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? list);
      setUnread((c) => Math.max(0, c - 1));
    }
    openNotification(n, (href) => router.push(href));
  };

  const groups = useMemo(() => {
    const map = new Map<Bucket, Notif[]>();
    for (const n of items ?? []) {
      const b = bucketOf(n.createdAt);
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(n);
    }
    return BUCKETS.filter((b) => map.has(b)).map((b) => ({ key: b, rows: map.get(b)! }));
  }, [items]);

  const activeOrg = getActiveOrgId();
  const otherName = (n: Notif) => (n.orgId && activeOrg && n.orgId !== activeOrg && orgNames.size > 1 ? orgNames.get(n.orgId) : undefined);

  return (
    <AppShell
      title={t('title')}
      action={
        <div className="flex items-center gap-2">
          {unread > 0 && tab !== 'archived' && (
            <button onClick={markAll} aria-label={t('markAll')} title={t('markAll')} className="v-btn v-btn-ghost">
              <Icon name="check" size={14} />
              <span className="hidden sm:inline">{t('markAll')}</span>
            </button>
          )}
          <button onClick={() => setPrefsOpen(true)} aria-label={t('settings')} title={t('settings')} className="v-btn v-btn-ghost !px-0 w-11 sm:w-[34px]">
            <Icon name="settings" size={15} />
          </button>
        </div>
      }
    >
      <div className="max-w-[860px]">
        <nav role="tablist" aria-label={t('title')} className="no-scrollbar -mx-5 flex gap-5 overflow-x-auto border-b border-line px-5 md:mx-0 md:px-0">
          {TABS.map((id) => {
            const active = tab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className={`relative flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 text-sm font-medium transition-colors sm:min-h-10 ${active ? 'text-ink' : 'text-muted hover:text-ink'}`}
              >
                {t(`tabs.${id}`)}
                {id === 'unread' && unread > 0 && <span className="tabular rounded-full bg-accent/10 px-1.5 text-2xs font-medium text-accent">{formatNumber(unread, locale)}</span>}
                {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink" />}
              </button>
            );
          })}
        </nav>

        <div className="no-scrollbar -mx-5 mt-4 flex gap-1.5 overflow-x-auto px-5 md:mx-0 md:px-0">
          {['all', ...CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              aria-pressed={cat === c}
              className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors sm:h-8 ${cat === c ? 'bg-ink text-canvas' : 'text-muted ring-1 ring-inset ring-line hover:text-ink'}`}
            >
              {c !== 'all' && <Icon name={CATEGORY_ICON[c]} size={13} />}
              {t(`categories.${c}`)}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {!items ? (
            <div className="v-card divide-y divide-line overflow-hidden">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3 px-5 py-4">
                  <div className="v-skeleton h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="v-skeleton h-3 w-2/5 rounded" />
                    <div className="v-skeleton h-3 w-3/5 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl px-6 py-16 text-center ring-1 ring-inset ring-line">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-elevated text-muted">
                <Icon name={tab === 'unread' ? 'check' : tab === 'archived' ? 'inbox' : 'bell'} size={19} />
              </span>
              <p className="mt-3 text-base font-medium text-ink">{t(`empty.${tab}Title`)}</p>
              <p className="mt-1 max-w-[380px] text-sm leading-relaxed text-muted">{tab === 'archived' ? t('empty.archivedBody') : t('empty.body')}</p>
            </div>
          ) : (
            <div className="space-y-7">
              {groups.map((g) => (
                <section key={g.key} aria-labelledby={`notif-${g.key}`}>
                  <h2 id={`notif-${g.key}`} className="mb-2 text-xs font-medium text-muted">
                    {t(`groups.${g.key}`)}
                  </h2>
                  <ul className="v-card divide-y divide-line overflow-hidden">
                    {g.rows.map((n) => (
                      <li key={n.id}>
                        <NotificationRow
                          n={n}
                          archived={tab === 'archived'}
                          otherWorkspace={otherName(n)}
                          onOpen={open}
                          onToggleRead={toggleRead}
                          onArchive={archive}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {hasMore && (
                <div className="flex justify-center">
                  <button onClick={loadMore} disabled={loadingMore} className="v-btn v-btn-ghost disabled:opacity-60">
                    {loadingMore ? t('loading') : t('loadMore')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Preferences open={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </AppShell>
  );
}

/** Which kinds of notification to receive, one switch per kind. */
function Preferences({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('notifications');
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    if (!open) return;
    authFetch<{ category: string; inApp: boolean }[]>('/notifications/preferences')
      .then((rows) => setPrefs(Object.fromEntries(rows.map((r) => [r.category, r.inApp]))))
      .catch(() => setPrefs({}));
  }, [open]);

  function flip(category: string) {
    const next = !(prefs?.[category] ?? true);
    setPrefs((p) => ({ ...(p ?? {}), [category]: next }));
    authFetch('/notifications/preferences', { method: 'PATCH', body: JSON.stringify({ category, inApp: next }) }).catch(() =>
      setPrefs((p) => ({ ...(p ?? {}), [category]: !next })),
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('settings')} closeLabel={t('close')}>
      <p className="text-sm leading-relaxed text-muted">{t('prefs.intro')}</p>
      <ul className="-mx-5 mt-4 divide-y divide-line border-y border-line">
        {CATEGORIES.map((c) => {
          const on = prefs?.[c] ?? true;
          return (
            <li key={c}>
              <label className="flex cursor-pointer items-start gap-3 px-5 py-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-elevated text-muted ring-1 ring-inset ring-line">
                  <Icon name={CATEGORY_ICON[c]} size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{t(`categories.${c}`)}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{t(`prefs.${c}`)}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={t(`categories.${c}`)}
                  disabled={!prefs}
                  onClick={() => flip(c)}
                  className={`relative mt-1 inline-flex h-[18px] w-[30px] shrink-0 rounded-full transition-colors before:absolute before:-inset-x-3 before:-inset-y-[13px] before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60 sm:before:hidden ${on ? 'bg-accent' : ''}`}
                  style={on ? undefined : { background: 'hsl(var(--v-border-strong))' }}
                >
                  <span className={`pointer-events-none absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-[inset-inline-start] ${on ? 'start-[14px]' : 'start-[2px]'}`} />
                </button>
              </label>
            </li>
          );
        })}
      </ul>
      <DevicePush open={open} />
      <LeadAlerts open={open} />
    </Sheet>
  );
}
