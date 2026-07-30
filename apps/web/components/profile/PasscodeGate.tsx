'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VMark } from '@/components/brand/VMark';

/**
 * PIN gate shown when a passcode-protected profile variant is opened without the
 * correct code. Submitting reloads the same URL with `?p=<key>&code=<pin>` so the
 * server resolves and reveals the variant.
 */
export function PasscodeGate({
  slug,
  p,
  profileName,
  wrongCode,
}: {
  slug: string;
  p: string;
  profileName: string;
  wrongCode: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    const qs = new URLSearchParams({ p, code: code.trim() });
    router.push(`/c/${slug}?${qs.toString()}`);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 text-ink">
      <form onSubmit={submit} className="w-full max-w-[380px] text-center">
        <span
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg"
          style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
        >
          <VMark size={26} strokeWidth={2.8} />
        </span>

        <h1 className="mt-6 text-[22px] font-extrabold tracking-tight">Private profile</h1>
        <p className="mt-2 text-[14px] font-medium text-muted">
          {profileName ? (
            <>“{profileName}” is protected. Enter the passcode to view it.</>
          ) : (
            <>This profile is protected. Enter the passcode to view it.</>
          )}
        </p>

        <input
          autoFocus
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Passcode"
          className="mt-6 w-full rounded-xl border border-line bg-surface px-4 py-3 text-center text-[18px] font-bold tracking-[0.3em] outline-none focus:border-accent"
        />

        {wrongCode && (
          <p className="mt-2 text-[13px] font-semibold text-red-500">Incorrect passcode. Try again.</p>
        )}

        <button
          type="submit"
          disabled={submitting || !code.trim()}
          className="v-btn mt-4 h-11 w-full text-[14.5px] font-bold disabled:opacity-50"
        >
          {submitting ? 'Unlocking…' : 'Unlock profile'}
        </button>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-[11.5px] text-faint">
          <span style={{ color: 'var(--v-accent)' }}><VMark size={12} strokeWidth={3} /></span>
          Powered by <span className="font-semibold text-muted">Vertex Connect</span>
        </p>
      </form>
    </main>
  );
}
