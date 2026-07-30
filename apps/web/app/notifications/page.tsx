'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getToken } from '@/lib/client';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { relativeTime } from '@/lib/crm';

interface Notif {
  id: string;
  type: string;
  category: string;
  priority: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  actor: { name: string | null; email: string; avatarUrl?: string | null } | null;
}

const CATEGORY_META: Record<string, { icon: string; color: string }> = {
  CRM: { icon: 'inbox', color: '#2563eb' },
  ORGANIZATION: { icon: 'users', color: '#0ea5e9' },
  SECURITY: { icon: 'lock', color: '#f43f5e' },
  BILLING: { icon: 'chart-bar', color: '#10b981' },
  CARD: { icon: 'columns', color: '#3b82f6' },
  NFC: { icon: 'sparkle', color: '#ec4899' },
  QR: { icon: 'qr', color: '#14b8a6' },
  SYSTEM: { icon: 'sparkle', color: '#94a3b8' },
};
const catMeta = (c: string) => CATEGORY_META[c] ?? { icon: 'bell', color: '#94a3b8' };
const PRIORITY_DOT: Record<string, string> = { CRITICAL: '#ef4444', HIGH: '#f59e0b', MEDIUM: '#2563eb', LOW: '#94a3b8', INFO: '#0ea5e9' };

type Tab = { key: string; label: string; query: string };
const TABS: Tab[] = [
  { key: 'all', label: 'All', query: '' },
  { key: 'unread', label: 'Unread', query: 'unread=true' },
  { key: 'crm', label: 'CRM', query: 'category=CRM' },
  { key: 'org', label: 'Organization', query: 'category=ORGANIZATION' },
  { key: 'security', label: 'Security', query: 'category=SECURITY' },
  { key: 'billing', label: 'Billing', query: 'category=BILLING' },
  { key: 'system', label: 'System', query: 'category=SYSTEM' },
  { key: 'archived', label: 'Archived', query: 'archived=true' },
];

const PREF_CATEGORIES: { key: string; label: string; desc: string }[] = [
  { key: 'CRM', label: 'CRM', desc: 'New leads, assignments, and pipeline updates' },
  { key: 'ORGANIZATION', label: 'Organization', desc: 'Members, teams, and workspace changes' },
  { key: 'SECURITY', label: 'Security', desc: 'Access, suspensions, and sign-in alerts' },
  { key: 'BILLING', label: 'Billing', desc: 'Plans, invoices, and usage limits' },
  { key: 'SYSTEM', label: 'System', desc: 'Maintenance, releases, and incidents' },
];

function dayBucket(iso: string): 'Today' | 'Yesterday' | 'This week' | 'Earlier' {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startToday) return 'Today';
  if (t >= startToday - 86_400_000) return 'Yesterday';
  if (t >= startToday - 6 * 86_400_000) return 'This week';
  return 'Earlier';
}

export default function NotificationsPage() {
  const router = useRouter();
  const { t } = useTranslation('notifications');
  const [tab, setTab] = useState('all');
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});

  const activeTab = TABS.find((t) => t.key === tab)!;
  const isArchived = tab === 'archived';

  const refreshUnread = useCallback(() => {
    authFetch<{ count: number }>('/notifications/unread-count').then((r) => setUnread(r.count)).catch(() => {});
  }, []);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const rows = await authFetch<Notif[]>(`/notifications${q ? `?${q}` : ''}`);
      setItems(rows);
      setHasMore(rows.length === 30);
    } catch {
      setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    refreshUnread();
    authFetch<{ category: string; inApp: boolean }[]>('/notifications/preferences')
      .then((rows) => setPrefs(Object.fromEntries(rows.map((r) => [r.category, r.inApp]))))
      .catch(() => {});
  }, [router, refreshUnread]);

  function togglePref(category: string) {
    const next = !(prefs[category] ?? true);
    setPrefs((p) => ({ ...p, [category]: next }));
    authFetch('/notifications/preferences', { method: 'PATCH', body: JSON.stringify({ category, inApp: next }) }).catch(() => {});
  }

  useEffect(() => { load(activeTab.query); }, [activeTab.query, load]);

  async function loadMore() {
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const q = `${activeTab.query ? `${activeTab.query}&` : ''}cursor=${last.id}`;
      const rows = await authFetch<Notif[]>(`/notifications?${q}`);
      setItems((prev) => [...prev, ...rows]);
      setHasMore(rows.length === 30);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleRead(n: Notif) {
    const nowRead = !n.readAt;
    setItems((x) => x.map((i) => (i.id === n.id ? { ...i, readAt: nowRead ? new Date().toISOString() : null } : i)));
    setUnread((c) => Math.max(0, c + (nowRead ? -1 : 1)));
    authFetch(`/notifications/${n.id}/${nowRead ? 'read' : 'unread'}`, { method: 'PATCH' }).catch(() => {});
  }

  function archive(n: Notif) {
    setItems((x) => x.filter((i) => i.id !== n.id));
    if (!n.readAt) setUnread((c) => Math.max(0, c - 1));
    authFetch(`/notifications/${n.id}/archive`, { method: 'PATCH' }).catch(() => {});
  }

  function markAll() {
    setItems((x) => x.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnread(0);
    authFetch('/notifications/read-all', { method: 'POST' }).catch(() => {});
  }

  const groups = useMemo(() => {
    const order: string[] = ['Today', 'Yesterday', 'This week', 'Earlier'];
    const map = new Map<string, Notif[]>();
    for (const n of items) {
      const b = dayBucket(n.createdAt);
      (map.get(b) ?? map.set(b, []).get(b)!).push(n);
    }
    return order.filter((o) => map.has(o)).map((o) => ({ label: o, rows: map.get(o)! }));
  }, [items]);

  return (
    <AppShell
      title={t('title', 'Notifications & Alerts')}
      action={
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button onClick={markAll} className="v-btn v-btn-ghost !h-9 text-[12.5px] font-bold">
              <Icon name="check" size={14} /> Mark all read
            </button>
          )}
          <button
            onClick={() => setPrefsOpen((o) => !o)}
            className="v-btn v-btn-ghost !h-9 !w-9 !p-0"
            aria-label="Notification preferences"
            aria-pressed={prefsOpen}
            title="Preferences"
          >
            <Icon name="settings" size={16} />
          </button>
        </div>
      }
    >
      {/* Preferences panel */}
      {prefsOpen && (
        <div className="v-card mb-5 p-5">
          <div className="mb-3">
            <h3 className="text-[14px] font-bold text-ink">In-app preferences</h3>
            <p className="text-[11.5px] text-muted">Choose which categories deliver in-app notifications.</p>
          </div>
          <div className="divide-y divide-line">
            {PREF_CATEGORIES.map((c) => {
              const on = prefs[c.key] ?? true;
              const meta = catMeta(c.key);
              return (
                <div key={c.key} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${meta.color}1a`, color: meta.color }}>
                      <Icon name={meta.icon} size={15} />
                    </span>
                    <div>
                      <p className="text-[13px] font-bold text-ink">{c.label}</p>
                      <p className="text-[11px] text-muted">{c.desc}</p>
                    </div>
                  </div>
                  <button
                    role="switch"
                    aria-checked={on}
                    aria-label={`${c.label} in-app notifications`}
                    onClick={() => togglePref(c.key)}
                    className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                    style={{ background: on ? 'var(--v-accent)' : 'hsl(var(--v-border-strong))' }}
                  >
                    <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? '22px' : '2px' }} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Category tabs */}
      <div className="no-scrollbar mb-5 flex gap-1.5 overflow-x-auto border-b border-line pb-3">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12.5px] font-bold transition-all ${
                active ? 'text-white' : 'text-muted hover:text-ink hover:bg-ink/5'
              }`}
              style={active ? { background: 'var(--v-gradient-brand)', boxShadow: 'var(--v-shadow-accent)' } : undefined}
            >
              {t.label}
              {t.key === 'unread' && unread > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] font-black ${active ? 'bg-white/25 text-white' : 'bg-red-500 text-white'}`}>{unread}</span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-2.5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="v-skeleton h-[70px] w-full rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <div className="v-card flex flex-col items-center gap-3 py-20 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'var(--v-accent-soft)', color: 'var(--v-accent)' }}>
            <Icon name="bell" size={28} />
          </span>
          <div>
            <p className="text-[16px] font-bold text-ink">{isArchived ? 'Nothing archived' : tab === 'unread' ? "You're all caught up" : 'No notifications yet'}</p>
            <p className="mt-1 max-w-sm text-[13px] text-muted">Events across your cards, CRM, and organization show up here as they happen.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-faint">{g.label}</p>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm divide-y divide-line">
                {g.rows.map((n) => {
                  const meta = catMeta(n.category);
                  return (
                    <div key={n.id} className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-canvas/30" style={{ background: n.readAt || isArchived ? undefined : 'var(--v-accent-soft)' }}>
                      {n.actor ? (
                        // A person triggered this — lead with their face and
                        // demote the category to a badge on the corner.
                        <span className="relative mt-0.5 shrink-0">
                          <Avatar user={n.actor} size={36} />
                          <span
                            className="absolute -bottom-0.5 -end-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-[hsl(var(--v-surface))]"
                            style={{ background: meta.color, color: '#fff' }}
                          >
                            <Icon name={meta.icon} size={10} />
                          </span>
                        </span>
                      ) : (
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `${meta.color}1a`, color: meta.color }}>
                          <Icon name={meta.icon} size={16} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_DOT[n.priority] ?? '#94a3b8' }} title={n.priority} />
                          <p className={`truncate text-[13.5px] ${n.readAt ? 'font-semibold text-ink' : 'font-bold text-ink'}`}>{n.title}</p>
                        </div>
                        {n.body && <p className="mt-0.5 text-[12px] text-muted">{n.body}</p>}
                        <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
                          {n.category.toLowerCase()} · {relativeTime(n.createdAt)}{n.actor?.name ? ` · ${n.actor.name}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {!isArchived && (
                          <button onClick={() => toggleRead(n)} title={n.readAt ? 'Mark unread' : 'Mark read'} aria-label={n.readAt ? 'Mark unread' : 'Mark read'} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink">
                            <Icon name={n.readAt ? 'eye-off' : 'check'} size={14} />
                          </button>
                        )}
                        {!isArchived && (
                          <button onClick={() => archive(n)} title="Archive" aria-label="Archive" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink">
                            <Icon name="inbox" size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="flex justify-center pt-1">
              <button onClick={loadMore} disabled={loadingMore} className="v-btn v-btn-ghost !h-9 text-[12.5px] font-bold disabled:opacity-60">
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
