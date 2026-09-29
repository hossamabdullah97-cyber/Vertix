'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VMark } from '@/components/brand/VMark';
import { Icon } from '@/components/Icon';
import { fill, profileStrings, type Lang } from '@/lib/profileI18n';
import { profileAttrs, profileStyle, type ThemeMode } from '@/lib/profile';

/**
 * Shown when a passcode-protected profile is opened without the right code.
 * Submitting reloads the page with ?p=<key>&code=<pin>, and the server decides.
 * It wears the profile's colours and language; without them (an older API),
 * it follows the visitor's language.
 */
export function PasscodeGate({
  slug,
  p,
  profileName,
  look,
  wrongCode,
}: {
  slug: string;
  p: string;
  profileName: string;
  look?: { accent: string | null; mode: ThemeMode; lang: Lang };
  wrongCode: boolean;
}) {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>(look?.lang ?? 'en');
  const theme = { accent: look?.accent ?? '#2563eb', mode: look?.mode ?? 'light' } as const;
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const t = profileStrings(lang);

  useEffect(() => {
    if (!look && navigator.language?.toLowerCase().startsWith('ar')) setLang('ar');
  }, [look]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    router.push(`/c/${slug}?${new URLSearchParams({ p, code: code.trim() })}`);
  };

  return (
    <main
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      style={profileStyle(theme)}
      {...profileAttrs(theme)}
      className="flex min-h-[100dvh] items-center justify-center bg-[var(--p-bg)] px-6 text-[var(--p-fg)]"
    >
      <form onSubmit={submit} className="w-full max-w-[360px] rounded-[20px] bg-[var(--p-surface)] p-6 text-center shadow-[0_0_0_1px_var(--p-line),0_24px_48px_-24px_rgba(0,0,0,0.2)]">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--p-elevated)] text-[var(--p-muted)]">
          <Icon name="lock" size={20} />
        </span>
        <h1 className="mt-4 text-[20px] font-semibold">{t.lockedTitle}</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--p-muted)]">{profileName ? fill(t.lockedBody, { name: profileName }) : t.lockedBodyNoName}</p>

        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          dir="ltr"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t.passcode}
          aria-label={t.passcode}
          aria-invalid={wrongCode}
          className="mt-5 h-12 w-full rounded-[12px] bg-[var(--p-elevated)] px-4 text-center text-[18px] font-medium tracking-[0.3em] outline-none ring-1 ring-inset ring-transparent placeholder:tracking-normal placeholder:text-[var(--p-faint)] focus:ring-[var(--p-accent)]"
        />
        {wrongCode && <p className="mt-2 text-[13.5px] text-[#d4453a]">{t.wrongCode}</p>}

        <button type="submit" disabled={submitting || !code.trim()} className="mt-3 h-12 w-full rounded-[12px] bg-[var(--p-accent)] text-[15px] font-medium text-[var(--p-on-accent)] disabled:opacity-50">
          {submitting ? t.unlocking : t.unlock}
        </button>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-[var(--p-faint)]">
          {t.poweredBy}
          <span className="flex items-center gap-1 font-medium text-[var(--p-muted)]">
            <VMark size={12} strokeWidth={3} /> Vertex Connect
          </span>
        </p>
      </form>
    </main>
  );
}
