'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
      <AuthShell title="Invalid invitation">
        <p className="text-sm text-muted">This invitation link is missing its token.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Accept your invitation"
      subtitle="Set a password to join your organization."
    >
      <form onSubmit={submit} className="grid gap-3">
        <input
          className="input"
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="password"
          className="input"
          placeholder="Choose a password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? 'Joining…' : 'Accept & continue'}
        </button>
      </form>
    </AuthShell>
  );
}
