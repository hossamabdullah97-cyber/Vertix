'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { SALES_MAILTO } from '@/lib/contact';
import { Icon } from '@/components/Icon';
import { DirectionalIcon } from '@/components/i18n/DirectionalIcon';
import { Header, useSignedIn } from './Header';
import { HeroVisual } from './HeroVisual';
import { Product } from './Product';
import { Pricing } from './Pricing';
import { Faq } from './Faq';
import { Footer } from './Footer';
import { Contactless, REGISTER, SectionHead, WRAP } from './shared';

export function Landing() {
  // Follows the theme chosen inside the app, so a returning visitor is not
  // switched from dark to light on the way in.
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    try {
      if (localStorage.getItem('vertex_theme') === 'dark') setTheme('dark');
    } catch {
      // storage unavailable: stay light
    }
  }, []);

  return (
    <div data-theme={theme} className="min-h-screen bg-canvas text-ink antialiased">
      <Header />
      <main>
        <Hero />
        <Product />
        <How />
        <Pricing />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

function Hero() {
  const { t } = useTranslation('landing');
  const signedIn = useSignedIn();
  return (
    <section aria-labelledby="hero-title">
      <div className={`${WRAP} grid items-center gap-8 pb-16 pt-10 sm:pt-16 lg:grid-cols-2 lg:gap-6 lg:pb-20 lg:pt-16`}>
        <div className="max-w-xl">
          <p className="inline-flex h-7 items-center gap-2 rounded-full bg-surface px-3 text-[12.5px] text-muted ring-1 ring-line">
            <Contactless size={13} className="text-accent" />
            {t('hero.eyebrow')}
          </p>
          <h1 id="hero-title" className="mt-6 text-[38px] font-semibold leading-[1.06] tracking-[-0.035em] text-ink sm:text-[52px] lg:text-[56px] rtl:leading-[1.3] rtl:tracking-normal">
            {t('hero.title')}
          </h1>
          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-muted sm:text-[17px]">{t('hero.subtitle')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {signedIn ? (
              <Link href="/dashboard" className="v-btn !h-11 px-5 text-[14px]">
                {t('nav.dashboard')} <DirectionalIcon name="arrow" size={15} />
              </Link>
            ) : (
              <>
                <Link href={REGISTER} className="v-btn !h-11 px-5 text-[14px]">
                  {t('hero.primary')} <DirectionalIcon name="arrow" size={15} />
                </Link>
                <Link href="/login" className="v-btn v-btn-ghost !h-11 px-5 text-[14px]">
                  {t('hero.secondary')}
                </Link>
              </>
            )}
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
            {(['free', 'phones', 'languages'] as const).map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <Icon name="check" size={14} className="text-accent" />
                {t(`hero.facts.${k}`)}
              </li>
            ))}
          </ul>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}

const STEPS = ['create', 'share', 'follow'] as const;

function How() {
  const { t } = useTranslation('landing');
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-16 border-y border-line bg-surface py-20 sm:py-28">
      <div className={WRAP}>
        <SectionHead id="how-title" label={t('how.label')} title={t('how.title')} />
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <li key={s}>
              <div className="flex items-center gap-4">
                <span className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[14px] font-semibold text-accent">{i + 1}</span>
                {i < STEPS.length - 1 && <span aria-hidden className="hidden h-px flex-1 bg-line md:block" />}
              </div>
              <h3 className="mt-5 text-[16px] font-semibold text-ink">{t(`how.steps.${s}.title`)}</h3>
              <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-muted">{t(`how.steps.${s}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Closing() {
  const { t } = useTranslation('landing');
  const signedIn = useSignedIn();
  return (
    <section aria-labelledby="cta-title" className="pb-20 sm:pb-28">
      <div className={WRAP}>
        <div className="relative flex flex-col gap-8 overflow-hidden rounded-2xl bg-surface px-6 py-10 ring-1 ring-line sm:px-12 sm:py-14 lg:flex-row lg:items-center lg:justify-between">
          <div
            aria-hidden
            className="absolute inset-y-0 end-0 w-1/2 [background-image:radial-gradient(hsl(var(--v-border-strong))_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_left,black,transparent)] rtl:[mask-image:linear-gradient(to_right,black,transparent)]"
          />
          <div className="relative max-w-xl">
            <h2 id="cta-title" className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[32px] rtl:leading-snug rtl:tracking-normal">
              {t('cta.title')}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{t('cta.body')}</p>
          </div>
          <div className="relative flex flex-wrap gap-3">
            <Link href={signedIn ? '/dashboard' : REGISTER} className="v-btn !h-11 px-5 text-[14px]">
              {signedIn ? t('nav.dashboard') : t('cta.primary')}
            </Link>
            <a href={SALES_MAILTO} className="v-btn v-btn-ghost !h-11 px-5 text-[14px]">
              {t('cta.secondary')}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
