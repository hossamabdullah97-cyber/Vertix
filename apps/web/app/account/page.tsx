'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { authFetch, getToken, type Me } from '@/lib/client';
import AppShell from '@/components/AppShell';
import { TwoStepPanel } from '@/components/account/TwoStepPanel';
import { DevicesPanel } from '@/components/account/DevicesPanel';
import { ProfilePhotoCard } from '@/components/ProfilePhotoCard';
import { DeleteAccount, ExportMyData } from '@/components/account/AccountData';

/** The signed-in person's own account, apart from any workspace: how they sign in, their data, closing it. */
export default function AccountPage() {
  const router = useRouter();
  const { t } = useTranslation('settings');
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login?next=/account');
      return;
    }
    authFetch<Me>('/auth/me').then(setMe, () => {});
  }, [router]);

  return (
    <AppShell title={t('title')}>
      <p className="max-w-[640px] text-sm leading-relaxed text-muted">{t('subtitle')}</p>
      <div className="mt-6 max-w-[760px] space-y-4">
        {/* The photo goes with the person, whatever workspace they are in. */}
        {me && <ProfilePhotoCard me={me} onChange={setMe} />}
        <TwoStepPanel />
        <DevicesPanel />
        <ExportMyData />
        <DeleteAccount me={me} />
      </div>
    </AppShell>
  );
}
