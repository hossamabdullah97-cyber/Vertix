'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { resetPassword } from '@/lib/client';
import AuthShell from '@/components/AuthShell';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const { t } = useTranslation('auth');
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title={t('reset.invalidTitle')}>
        <p className="text-sm text-muted">{t('reset.invalidBody')}</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('reset.titleChoose')}>
      {done ? (
        <div>
          <p className="text-sm text-green-700">{t('reset.done')}</p>
          <Link href="/login" className="mt-4 inline-block text-sm text-accent">
            {t('reset.signIn')}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-3">
          <input
            type="password"
            className="v-field"
            placeholder={t('reset.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="v-btn w-full" disabled={busy}>
            {busy ? t('reset.saving') : t('reset.submit')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
