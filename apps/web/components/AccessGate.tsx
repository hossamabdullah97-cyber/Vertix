'use client';

import { useEffect, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { authFetch, getToken, peek, type Me } from '@/lib/client';
import { canOpen } from '@/lib/permissions';

/** What a page that isn't part of someone's role shows instead of itself. */
export function NoAccess({ me, workspace }: { me: Pick<Me, 'role' | 'customRole'> | null; workspace?: string | null }) {
  const { t } = useTranslation('nav');
  const role = me?.customRole?.name ?? (me?.role ? t(`roles.${me.role}`) : '');
  return (
    <div className="mx-auto max-w-[480px] py-14 text-center" data-testid="page-no-access">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-muted ring-1 ring-inset ring-line">
        <Icon name="lock" size={20} />
      </span>
      <h2 className="mt-4 text-xl font-semibold text-ink">{t('pageNoAccess.title')}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {workspace ? t('pageNoAccess.body', { role, workspace }) : t('pageNoAccess.bodyNoName', { role })}
      </p>
      <Link href="/dashboard" className="v-btn mt-6">
        {t('pageNoAccess.home')}
      </Link>
    </div>
  );
}

/**
 * Opens the page only for someone whose role includes it (lib/permissions
 * canOpen). The page itself is not mounted otherwise, so it asks the API for
 * nothing it would be refused.
 */
export function gated<P extends object>(Page: ComponentType<P>, path: string, title?: (t: (k: string) => string) => string) {
  function Gated(props: P) {
    const { t } = useTranslation('nav');
    const [me, setMe] = useState<Me | null | undefined>(() => peek<Me>('/auth/me'));
    const [workspace, setWorkspace] = useState<string | null>(null);
    useEffect(() => {
      // Signed out: the page sends the person to sign in itself.
      if (!getToken()) return setMe(null);
      authFetch<Me>('/auth/me').then(setMe, () => setMe(null));
    }, []);
    const allowed = me === null || (me !== undefined && canOpen(me, path));
    useEffect(() => {
      if (me && !allowed) authFetch<{ name: string }>('/orgs/current').then((o) => setWorkspace(o.name), () => undefined);
    }, [me, allowed]);

    if (me === undefined) {
      return (
        <AppShell title={title?.(t)}>
          <div className="space-y-4" aria-busy>
            <div className="v-skeleton h-8 w-48 rounded-lg" />
            <div className="v-skeleton h-40 w-full rounded-xl" />
          </div>
        </AppShell>
      );
    }
    if (!allowed) {
      return (
        <AppShell title={title?.(t)}>
          <NoAccess me={me} workspace={workspace} />
        </AppShell>
      );
    }
    return <Page {...props} />;
  }
  Gated.displayName = `Gated(${Page.displayName ?? Page.name ?? 'Page'})`;
  return Gated;
}
