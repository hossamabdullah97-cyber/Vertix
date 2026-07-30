'use client';

import { useState } from 'react';
import { API_URL } from '@/lib/api';
import { Icon } from './Icon';

export default function ExchangeContact({
  slug,
  accent,
  dark,
}: {
  slug: string;
  accent: string;
  dark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', note: '' });

  const line = dark ? '#2c2c2a' : '#e6e6e9';
  const field = (k: keyof typeof form, placeholder: string, type = 'text') => (
    <input
      type={type}
      placeholder={placeholder}
      value={form[k]}
      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      style={{
        width: '100%',
        border: `1px solid ${line}`,
        background: dark ? '#1c1c20' : '#fff',
        color: 'inherit',
        borderRadius: 10,
        padding: '11px 13px',
        fontSize: 14,
        outline: 'none',
      }}
    />
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const visitorId =
        typeof window !== 'undefined' ? localStorage.getItem('vertex_visitor') ?? undefined : undefined;
      const res = await fetch(`${API_URL}/leads/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ...form, visitorId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          Array.isArray(data?.errors) && data.errors.length
            ? data.errors[0].message
            : data.message || 'Could not send',
        );
      }
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div
        style={{ borderColor: line }}
        className="rounded-2xl border p-5 text-center"
      >
        <div
          className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full text-white"
          style={{ background: accent }}
        >
          <Icon name="send" size={18} />
        </div>
        <p className="text-sm font-medium">Thanks! Your details were shared.</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ borderColor: line }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-semibold transition-opacity hover:opacity-80"
      >
        <Icon name="send" size={18} />
        Exchange contact
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{ borderColor: line }} className="grid gap-2.5 rounded-2xl border p-4">
      <p className="text-sm font-semibold">Share your details</p>
      {field('name', 'Full name *')}
      {field('email', 'Email', 'email')}
      {field('phone', 'Phone', 'tel')}
      {field('company', 'Company')}
      {field('note', 'Note (optional)')}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: accent }}
      >
        {busy ? 'Sending…' : 'Send my details'}
      </button>
    </form>
  );
}
