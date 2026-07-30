'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
      <AuthShell title="Invalid link">
        <p className="text-sm text-muted">This reset link is missing its token.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      {done ? (
        <div>
          <p className="text-sm text-green-700">Your password has been updated.</p>
          <Link href="/login" className="mt-4 inline-block text-sm text-accent">
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-3">
          <input
            type="password"
            className="input"
            placeholder="New password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
