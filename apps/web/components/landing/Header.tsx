'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { isAuthenticated } from '@/lib/client';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { Brand, REGISTER, WRAP } from './shared';

const LINKS = [
  { href: '#product', key: 'product' },
  { href: '#how', key: 'how' },
  { href: '#pricing', key: 'pricing' },
  { href: '#faq', key: 'faq' },
] as const;

/** Signed-in visitors get a way back to their workspace instead of sign-up. */
export function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(isAuthenticated()), []);
  return signedIn;
}

export function Header() {
  const { t } = useTranslation('landing');
  const signedIn = useSignedIn();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`sticky top-0 z-40 border-b bg-canvas/85 backdrop-blur-md transition-colors ${scrolled ? 'border-line' : 'border-transparent'}`}>
      <div className={`${WRAP} flex h-16 items-center gap-3 md:gap-6`}>
        <Brand />
        <nav aria-label={t('nav.label')} className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a key={l.key} href={l.href} className="rounded-md px-3 py-1.5 text-[13.5px] text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink">
              {t(`nav.${l.key}`)}
            </a>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <LanguageSwitcher />
          {signedIn ? (
            <Link href="/dashboard" className="v-btn">
              {t('nav.dashboard')}
            </Link>
          ) : (
            <>
              <Link href="/login" className="v-btn v-btn-ghost max-sm:!hidden">
                {t('nav.signIn')}
              </Link>
              <Link href={REGISTER} className="v-btn">
                {t('nav.start')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
