'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { authFetch } from '@/lib/client';
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
function catMeta(c: string) {
  return CATEGORY_META[c] ?? { icon: 'bell', color: '#94a3b8' };
}

const PRIORITY_DOT: Record<string, string> = { CRITICAL: '#ef4444', HIGH: '#f59e0b', MEDIUM: '#2563eb', LOW: '#94a3b8', INFO: '#0ea5e9' };

export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const ref = useRef<HTMLDivElement>(null);

  // Poll the unread counter (real-time approximation without a socket layer).
  useEffect(() => {
    let alive = true;
    const fetchCount = () =>
      authFetch<{ count: number }>('/notifications/unread-count').then((r) => { if (alive) setCount(r.count); }).catch(() => {});
    fetchCount();
    const iv = setInterval(fetchCount, 20000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function loadList() {
    setLoading(true);
    try { setItems(await authFetch<Notif[]>('/notifications')); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  }

  function markRead(id: string) {
    setItems((x) => x.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
    setCount((c) => Math.max(0, c - 1));
    authFetch(`/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
  }

  function markAll() {
    setItems((x) => x.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setCount(0);
    authFetch('/notifications/read-all', { method: 'POST' }).catch(() => {});
  }

  const shown = tab === 'unread' ? items.filter((n) => !n.readAt) : items;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label={`Notifications${count ? ` (${count} unread)` : ''}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink"
      >
        <Icon name="bell" size={18} />
        <AnimatePresence>
          {count > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9.5px] font-black text-white"
              style={{ background: '#ef4444' }}
            >
              {count > 99 ? '99+' : count}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute end-0 z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-[14px] font-bold text-ink">Notifications</h3>
              {count > 0 && (
                <button onClick={markAll} className="text-[11.5px] font-bold text-accent hover:underline">Mark all read</button>
              )}
            </div>

            <div className="flex gap-1 border-b border-line px-3 py-2">
              {(['all', 'unread'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="rounded-lg px-2.5 py-1 text-[11.5px] font-bold capitalize transition-colors"
                  style={tab === t ? { background: 'var(--v-gradient-brand)', color: '#fff' } : { color: 'hsl(var(--v-muted))' }}
                >
                  {t}{t === 'unread' && count > 0 ? ` (${count})` : ''}
                </button>
              ))}
            </div>

            <div className="no-scrollbar max-h-[380px] overflow-y-auto">
              {loading ? (
                <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <div key={i} className="v-skeleton h-14 w-full rounded-xl" />)}</div>
              ) : shown.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center text-faint">
                  <Icon name="bell" size={26} />
                  <p className="text-[12.5px] font-semibold text-muted">{tab === 'unread' ? "You're all caught up" : 'No notifications yet'}</p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {shown.map((n) => {
                    const meta = catMeta(n.category);
                    return (
                      <li key={n.id}>
                        <button
                          onClick={() => !n.readAt && markRead(n.id)}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas/40"
                          style={{ background: n.readAt ? undefined : 'var(--v-accent-soft)' }}
                        >
                          {n.actor ? (
                            // A person triggered this — lead with their face and
                            // demote the category to a badge on the corner.
                            <span className="relative mt-0.5 shrink-0">
                              <Avatar user={n.actor} size={32} />
                              <span
                                className="absolute -bottom-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-[hsl(var(--v-surface))]"
                                style={{ background: meta.color, color: '#fff' }}
                              >
                                <Icon name={meta.icon} size={9} />
                              </span>
                            </span>
                          ) : (
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${meta.color}1a`, color: meta.color }}>
                              <Icon name={meta.icon} size={15} />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_DOT[n.priority] ?? '#94a3b8' }} />
                              <p className={`truncate text-[12.5px] ${n.readAt ? 'font-semibold text-ink' : 'font-bold text-ink'}`}>{n.title}</p>
                            </div>
                            {n.body && <p className="mt-0.5 truncate text-[11.5px] text-muted">{n.body}</p>}
                            <p className="mt-0.5 text-[10.5px] text-faint">
                              {n.category.toLowerCase()} · {relativeTime(n.createdAt)}
                              {n.actor?.name ? ` · ${n.actor.name}` : ''}
                            </p>
                          </div>
                          {!n.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--v-accent)' }} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-line px-4 py-2.5 text-center text-[12px] font-bold text-accent hover:bg-canvas/40"
            >
              View all notifications
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
