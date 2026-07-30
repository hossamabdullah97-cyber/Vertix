'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { acceptInvite } from '@/lib/client';
import AuthShell from '@/components/AuthShell';

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInner />
    </Suspense>
  );
}

function AcceptInner() {
  const { t } = useTranslation('auth');
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await acceptInvite(token, password, name || undefined);
      router.replace('/dashboard');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title={t('invite.invalidTitle')}>
        <p className="text-sm text-muted">{t('invite.invalidBody')}</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('invite.title')} subtitle={t('invite.subtitle')}>
      <form onSubmit={submit} className="grid gap-3">
        <input
          className="v-field"
          placeholder={t('invite.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="password"
          className="v-field"
          placeholder={t('invite.passwordPlaceholder')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="v-btn w-full" disabled={busy}>
          {busy ? t('invite.joining') : t('invite.submit')}
        </button>
      </form>
    </AuthShell>
  );
}
