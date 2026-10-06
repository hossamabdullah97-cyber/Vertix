'use client';

import { can } from '@/lib/permissions';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { authFetch, getActiveOrgId, getToken, type Me } from '@/lib/client';
import AppShell from '@/components/AppShell';
import { AppsView } from '@/components/integrations/AppsView';
import { AutomationsView } from '@/components/integrations/AutomationsView';
import { WebhooksView } from '@/components/integrations/WebhooksView';
import { KeysView } from '@/components/integrations/KeysView';
import { Notice, type Handoff, type Role } from '@/components/integrations/shared';

type Tab = 'apps' | 'automations' | 'webhooks' | 'keys';
const TABS: Tab[] = ['apps', 'automations', 'webhooks', 'keys'];

/** Which tabs someone may open, by their level in integrations; the API refuses the rest anyway. */
function tabsFor(me: Me | null): Tab[] {
  if (can(me, 'integrations', 'full')) return TABS;
  if (can(me, 'integrations', 'basic')) return ['apps', 'automations', 'webhooks'];
  return ['apps'];
}

/**
 * Everything that connects the workspace to other software: apps it signs in
 * to, automations that act on events, webhooks that carry events out, and API
 * keys that let other software in.
 */
export default function IntegrationsPage() {
  const router = useRouter();
  const { t } = useTranslation('integrations');
  const [tab, setTab] = useState<Tab>('apps');
  const [me, setMe] = useState<Me | null>(null);
  const [personal, setPersonal] = useState(false);
  const [handoff, setHandoff] = useState<Handoff>(null);
  const [returned, setReturned] = useState<{ connected?: string; error?: string } | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    if (!getActiveOrgId()) {
      setPersonal(true);
      return;
    }
    const q = new URLSearchParams(window.location.search);
    // A provider sends the owner back here with ?connected or ?error.
    if (q.get('connected') || q.get('error')) setReturned({ connected: q.get('connected') ?? undefined, error: q.get('error') ?? undefined });
    const asked = q.get('tab') as Tab | null;
    authFetch<Me>('/auth/me')
      .then((m) => {
        setMe(m);
        if (asked && tabsFor(m).includes(asked)) setTab(asked);
      })
      .catch(() => {});
  }, [router]);

  const canManage = can(me, 'integrations', 'full');
  const tabs = tabsFor(me);

  const choose = useCallback((next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.search = next === 'apps' ? '' : `?tab=${next}`;
    window.history.replaceState(null, '', url);
  }, []);

  const handOff = useCallback(
    (h: Exclude<Handoff, null>) => {
      setHandoff(h);
      choose(h.kind === 'webhook' ? 'webhooks' : 'automations');
    },
    [choose],
  );

  if (personal) {
    return (
      <AppShell title={t('title')}>
        <div className="mx-auto max-w-[520px] rounded-xl px-6 py-10 text-center ring-1 ring-inset ring-line">
          <p className="text-sm leading-relaxed text-muted">{t('personal')}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t('title')}>
      <nav role="tablist" aria-label={t('title')} className="no-scrollbar -mx-5 mb-6 flex gap-5 overflow-x-auto border-b border-line px-5 md:-mx-8 md:px-8">
        {tabs.map((id) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => choose(id)}
              className={`relative flex min-h-11 min-w-11 shrink-0 items-center justify-center text-sm font-medium transition-colors sm:min-h-10 ${active ? 'text-ink' : 'text-muted hover:text-ink'}`}
            >
              {t(`tabs.${id}`)}
              {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink" />}
            </button>
          );
        })}
      </nav>

      <div className="max-w-[1120px]">
        {me && !canManage && <Notice icon="lock">{t('readOnly')}</Notice>}

        {tab === 'apps' && (
          <AppsView
            canManage={canManage}
            returned={returned}
            onReturnedSeen={() => {
              setReturned(null);
              window.history.replaceState(null, '', window.location.pathname);
            }}
            onHandOff={handOff}
            canHandOff={canManage}
          />
        )}
        {tab === 'automations' && <AutomationsView canManage={canManage} handoff={handoff} onHandled={() => setHandoff(null)} />}
        {tab === 'webhooks' && <WebhooksView canManage={canManage} handoff={handoff} onHandled={() => setHandoff(null)} />}
        {tab === 'keys' && canManage && <KeysView />}
      </div>
    </AppShell>
  );
}
