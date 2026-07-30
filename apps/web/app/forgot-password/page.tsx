'use client';

import { useState } from 'react';
import Link from 'next/link';
import { forgotPassword } from '@/lib/client';
import AuthShell from '@/components/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await forgotPassword(email.trim());
    setSent(true);
    setBusy(false);
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to set a new password."
    >
      {sent ? (
        <div>
          <p className="text-sm">
            If an account exists for <b>{email}</b>, a reset link is on its way.
          </p>
          <Link href="/login" className="mt-4 inline-block text-sm text-accent">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-3">
          <input
            type="email"
            className="input"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="btn" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <Link href="/login" className="text-center text-sm text-muted">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
