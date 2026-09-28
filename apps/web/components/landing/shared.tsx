'use client';

import Link from 'next/link';
import { VMark } from '@/components/brand/VMark';

/** Sign-up opens the login page on its "create an account" side. */
export const REGISTER = '/login?mode=register';

/** The page's column: the same width and gutters in every section. */
export const WRAP = 'mx-auto w-full max-w-[1160px] px-4 sm:px-6';

export function Brand() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-accent text-white">
        <VMark size={14} strokeWidth={3} />
      </span>
      <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-ink">Vertex Connect</span>
    </Link>
  );
}

export function SectionHead({ label, title, subtitle, id }: { label: string; title: string; subtitle?: string; id?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-[13px] font-medium text-accent">{label}</p>
      <h2 id={id} className="mt-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] text-ink sm:text-[36px] rtl:leading-[1.35] rtl:tracking-normal">
        {title}
      </h2>
      {subtitle && <p className="mt-3 text-[15px] leading-relaxed text-muted sm:text-[16px]">{subtitle}</p>}
    </div>
  );
}

/** Initials in a tinted circle, for the sample people in the illustrations. */
export function Initials({ name, hue, size = 28 }: { name: string; hue: number; size?: number }) {
  // Arabic letters would join into a word, so an Arabic name shows one.
  const words = name.trim().split(/\s+/);
  const letters = /[؀-ۿ]/.test(name) ? words[0][0] : words.slice(0, 2).map((w) => w[0]).join('');
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-[hsl(var(--h)_70%_92%)] text-[11px] font-semibold text-[hsl(var(--h)_55%_32%)] dark:bg-[hsl(var(--h)_30%_20%)] dark:text-[hsl(var(--h)_70%_80%)]"
      style={{ width: size, height: size, ['--h' as string]: hue }}
    >
      {letters}
    </span>
  );
}

/** The contactless mark printed on NFC cards. */
export function Contactless({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className={className} aria-hidden>
      <path d="M6.5 10.2a2.6 2.6 0 0 1 0 3.6" />
      <path d="M10 7.6a6.3 6.3 0 0 1 0 8.8" />
      <path d="M13.5 5a10 10 0 0 1 0 14" />
      <path d="M17 2.4a13.7 13.7 0 0 1 0 19.2" />
    </svg>
  );
}
