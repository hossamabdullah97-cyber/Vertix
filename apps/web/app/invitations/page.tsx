'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { getToken } from '@/lib/client';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { InvitationList, useInvitations } from '@/components/invitations/Invitations';

/** Workspaces that asked this person to join. Nothing changes until they answer. */
export default function InvitationsPage() {
  const router = useRouter();
  const { t } = useTranslation('nav');
  const { invites, loaded } = useInvitations();

  useEffect(() => {
    if (!getToken()) router.replace('/login?next=/invitations');
  }, [router]);

  return (
    <AppShell title={t('invitations.title')}>
      <p className="max-w-[640px] text-sm leading-relaxed text-muted">{t('invitations.subtitle')}</p>
      <div className="mt-6 max-w-[720px]">
        {!loaded ? (
          <div className="v-skeleton h-20 w-full rounded-xl" />
        ) : invites.length ? (
          <InvitationList invites={invites} />
        ) : (
          <div className="rounded-xl px-6 py-10 text-center ring-1 ring-inset ring-line">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-elevated text-muted ring-1 ring-inset ring-line">
              <Icon name="users" size={18} />
            </span>
            <h2 className="mt-3 text-base font-semibold text-ink">{t('invitations.emptyTitle')}</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('invitations.emptyBody')}</p>
            <Link href="/dashboard" className="v-btn v-btn-ghost mt-5">
              {t('invitations.home')}
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
