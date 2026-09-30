'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { authFetch, getToken, type Me } from '@/lib/client';
import AppShell from '@/components/AppShell';
import { Overview } from '@/components/admin/Overview';
import { Workspaces } from '@/components/admin/Workspaces';
import { People } from '@/components/admin/People';
import ChipRegistry from '@/components/admin/ChipRegistry';
import { Jobs } from '@/components/admin/Jobs';
import { AuditLog } from '@/components/admin/AuditLog';
import type { AdminOrg } from '@/components/admin/shared';

type Tab = 'overview' | 'workspaces' | 'people' | 'chips' | 'jobs' | 'log';
const TABS: Tab[] = ['overview', 'workspaces', 'people', 'chips', 'jobs', 'log'];

/**
 * The platform's own console, for the people who run Vertex Connect: every
 * workspace and person, the NFC stock, the background work, and the trail of
 * what admins did. Everything here is live; nothing is a placeholder.
 */
export default function AdminConsole() {
  const router = useRouter();
  const { t } = useTranslation('admin');
  const [tab, setTab] = useState<Tab>('overview');
  const [me, setMe] = useState<Me | null>(null);
  const [orgs, setOrgs] = useState<AdminOrg[] | null>(null);

  const loadOrgs = useCallback(() => {
    return authFetch<AdminOrg[]>('/admin/organizations').then(setOrgs);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    const q = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (q && TABS.includes(q)) setTab(q);
    authFetch<Me>('/auth/me')
      .then((m) => {
        setMe(m);
        if (m.isSuperAdmin) loadOrgs().catch(() => setOrgs([]));
      })
      .catch(() => {});
  }, [router, loadOrgs]);

  const choose = useCallback((next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.search = next === 'overview' ? '' : `?tab=${next}`;
    window.history.replaceState(null, '', url);
  }, []);

  if (me && !me.isSuperAdmin) {
    return (
      <AppShell title={t('title')}>
        <div className="mx-auto max-w-[520px] rounded-xl px-6 py-10 text-center ring-1 ring-inset ring-line">
          <p className="text-sm leading-relaxed text-muted">{t('denied')}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t('title')}>
      <nav role="tablist" aria-label={t('title')} className="no-scrollbar -mx-5 mb-6 flex gap-5 overflow-x-auto border-b border-line px-5 md:-mx-8 md:px-8">
        {TABS.map((id) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => choose(id)}
              className={`relative flex min-h-11 shrink-0 items-center text-sm font-medium transition-colors sm:min-h-10 ${active ? 'text-ink' : 'text-muted hover:text-ink'}`}
            >
              {t(`tabs.${id}`)}
              {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink" />}
            </button>
          );
        })}
      </nav>

      {!me ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="v-skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {tab === 'overview' && <Overview orgs={orgs} onOpen={choose} />}
          {tab === 'workspaces' && <Workspaces orgs={orgs} reload={loadOrgs} />}
          {tab === 'people' && <People onChanged={loadOrgs} />}
          {tab === 'chips' && <ChipRegistry orgs={orgs ?? []} />}
          {tab === 'jobs' && <Jobs />}
          {tab === 'log' && <AuditLog />}
        </>
      )}
    </AppShell>
  );
}
