'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import { NOTIFS_CHANGED, announceChange, openNotification, type Notif } from '@/components/notifications/model';

/**
 * The bell in the top bar: how many are unread, and the latest few. Opening
 * one takes you to what it is about; the full list lives on /notifications.
 */
export function NotificationBell() {
  const { t } = useTranslation('notifications');
  const router = useRouter();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notif[] | null>(null);
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(() => {
    authFetch<{ count: number }>('/notifications/unread-count')
      .then((r) => setCount(r.count))
      .catch(() => {});
  }, []);

  // No socket layer yet: poll the counter, and recount after any change.
  useEffect(() => {
    fetchCount();
    const iv = setInterval(fetchCount, 20000);
    window.addEventListener(NOTIFS_CHANGED, fetchCount);
    return () => {
      clearInterval(iv);
      window.removeEventListener(NOTIFS_CHANGED, fetchCount);
    };
  }, [fetchCount]);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setItems(null);
      authFetch<Notif[]>('/notifications')
        .then(setItems)
        .catch(() => setItems([]));
    }
  }

  function markAll() {
    setItems((x) => x?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? x);
    setCount(0);
    authFetch('/notifications/read-all', { method: 'POST' }).then(announceChange).catch(() => {});
  }

  function openOne(n: Notif) {
    if (!n.readAt) {
      setItems((x) => x?.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)) ?? x);
      setCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    openNotification(n, (href) => router.push(href));
  }

  const shown = (unreadOnly ? items?.filter((n) => !n.readAt) : items)?.slice(0, 8) ?? null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label={count ? t('bellUnread', { count }) : t('bell')}
        aria-expanded={open}
        className="relative flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink md:h-9 md:w-9"
      >
        <Icon name="bell" size={18} />
        <AnimatePresence>
          {count > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="tabular absolute end-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9.5px] font-semibold text-white ring-2 ring-surface"
            >
              {count > 99 ? '99+' : count}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={t('title')}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
            className="absolute end-0 z-50 mt-2 w-[380px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-line bg-surface shadow-xl max-sm:fixed max-sm:inset-x-3 max-sm:top-[3.75rem] max-sm:mt-0 max-sm:w-auto max-sm:max-w-none"
          >
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <h3 className="flex-1 text-base font-semibold text-ink">{t('title')}</h3>
              <div role="radiogroup" className="inline-flex rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
                {([false, true] as const).map((u) => (
                  <button
                    key={String(u)}
                    role="radio"
                    aria-checked={unreadOnly === u}
                    onClick={() => setUnreadOnly(u)}
                    className={`h-7 rounded-md px-2.5 text-xs font-medium ${unreadOnly === u ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'}`}
                  >
                    {u ? t('tabs.unread') : t('tabs.all')}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[min(420px,calc(100dvh-12rem))] overflow-y-auto">
              {!shown ? (
                <div className="space-y-3 p-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex gap-3">
                      <div className="v-skeleton h-8 w-8 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="v-skeleton h-3 w-1/2 rounded" />
                        <div className="v-skeleton h-3 w-3/4 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : shown.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-10 text-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-elevated text-muted">
                    <Icon name={unreadOnly ? 'check' : 'bell'} size={16} />
                  </span>
                  <p className="mt-2.5 text-sm font-medium text-ink">{unreadOnly ? t('empty.unreadTitle') : t('empty.allTitle')}</p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {shown.map((n) => (
                    <li key={n.id}>
                      <NotificationRow n={n} compact onOpen={openOne} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2">
              <Link href="/notifications" onClick={() => setOpen(false)} className="flex h-8 items-center text-xs font-medium text-accent hover:underline">
                {t('viewAll')}
              </Link>
              {count > 0 && (
                <button onClick={markAll} className="flex h-8 items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
                  <Icon name="check" size={13} /> {t('markAll')}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
