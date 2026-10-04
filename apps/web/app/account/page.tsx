'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { getToken } from '@/lib/client';
import AppShell from '@/components/AppShell';
import { TwoStepPanel } from '@/components/account/TwoStepPanel';

/** The signed-in person's own account, apart from any workspace: how they sign in. */
export default function AccountPage() {
  const router = useRouter();
  const { t } = useTranslation('settings');

  useEffect(() => {
    if (!getToken()) router.replace('/login?next=/account');
  }, [router]);

  return (
    <AppShell title={t('title')}>
      <p className="max-w-[640px] text-sm leading-relaxed text-muted">{t('subtitle')}</p>
      <div className="mt-6 max-w-[760px] space-y-4">
        <TwoStepPanel />
      </div>
    </AppShell>
  );
}
