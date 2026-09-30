'use client';

import { useEffect, useState } from 'react';
import { QRCode } from '@/components/QRCode';
import { Icon } from '@/components/Icon';
import { profileStrings, type Lang } from '@/lib/profileI18n';

/**
 * Beside the card on a wide screen: most people open a card on a computer
 * only to move it to their phone, so the code to do that is right there.
 */
export function CardCompanion({ slug, lang, variant }: { slug: string; lang: Lang; variant?: string }) {
  const t = profileStrings(lang);
  const [url, setUrl] = useState('');

  useEffect(() => {
    // The clean address: the chip and passcode the visitor came with stay here.
    setUrl(`${window.location.origin}/c/${slug}${variant ? `?p=${encodeURIComponent(variant)}` : ''}`);
  }, [slug, variant]);

  return (
    <aside dir={lang === 'ar' ? 'rtl' : 'ltr'} className="sticky top-10 hidden w-[260px] shrink-0 text-[var(--p-fg)] lg:block">
      <div className="rounded-[20px] bg-[var(--p-surface)] p-5 shadow-[0_0_0_1px_var(--p-line),0_24px_48px_-24px_rgba(0,0,0,0.25)]">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--p-elevated)] text-[var(--p-accent)]">
          <Icon name="qr" size={17} />
        </span>
        <h2 className="mt-3 text-lg font-semibold leading-snug">{t.companionTitle}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--p-muted)]">{t.companionHint}</p>
        <div className="mx-auto mt-4 w-fit rounded-[14px] bg-white p-3 ring-1 ring-inset ring-black/5">
          {url ? <QRCode value={url} size={176} /> : <div className="h-[176px] w-[176px]" />}
        </div>
      </div>
    </aside>
  );
}
