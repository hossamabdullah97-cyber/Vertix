'use client';

import { useEffect, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { PublicProfile } from '@/components/profile/PublicProfile';
import type { ProfileData } from '@/lib/profile';
import { Icon } from '@/components/Icon';
import { VMark } from '@/components/brand/VMark';
import { Contactless } from './shared';

// The card is laid out at a phone's width and scaled into the frame, so it
// reads exactly as it does on a real phone.
const PHONE_WIDTH = 375;
const SCREEN_W = 270;
const SCREEN_H = 556;
const SCALE = SCREEN_W / PHONE_WIDTH;

/**
 * The real public card, filled with a sample person, in a phone; the NFC card
 * that opens it; and the lead it just brought in. Illustration only: nothing
 * in it can be focused or pressed.
 */
export function HeroVisual() {
  const { t } = useTranslation('landing');
  const { locale } = useLocale();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  // React 18 has no `inert` prop; it keeps the card's buttons out of the tab order.
  useEffect(() => {
    ref.current?.setAttribute('inert', '');
  }, []);

  const profile = useMemo<ProfileData>(
    () => ({
      slug: 'mariam-khaled',
      name: t('sample.name'),
      title: t('sample.title'),
      company: '',
      about: t('sample.about'),
      avatar: '',
      coverImage: '',
      coverStyle: 'gradient',
      layout: 'classic',
      accent: '#2563eb',
      mode: 'light',
      lang: locale,
      langs: [locale],
      circle: true,
      verified: true,
      brand: null,
      wallet: { apple: false, google: false },
      privacyUrl: null,
      linkStyle: 'list',
      openInApp: false,
      meta: { available: 'now', location: t('sample.location'), languages: '', responseTime: '' },
      profileName: null,
      actions: [
        { id: 'call', type: 'CALL', order: 0, config: { phone: '+20 100 000 0000' } },
        { id: 'whatsapp', type: 'WHATSAPP', order: 1, config: { phone: '+201000000000' } },
        { id: 'email', type: 'EMAIL', order: 2, config: { email: 'mariam@example.com' } },
        { id: 'linkedin', type: 'LINKEDIN', order: 3, config: { url: 'https://linkedin.com/in/mariam-khaled' } },
        { id: 'instagram', type: 'WEBSITE', order: 4, config: { url: 'https://instagram.com/nilestudio' } },
      ],
      paymentLinks: [],
      sections: [],
    }),
    [t, locale],
  );

  const enter = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay, ease: [0.2, 0.7, 0.2, 1] as [number, number, number, number] } };

  return (
    <figure aria-label={t('sample.label')} className="relative mx-auto h-[520px] w-full max-w-[540px] [clip-path:inset(0_-100vw)] sm:h-[640px] sm:[clip-path:none]">
      {/* A quiet dotted field, fading out at the edges. */}
      <div
        aria-hidden
        className="absolute inset-0 [background-image:radial-gradient(hsl(var(--v-border-strong))_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(closest-side,black_45%,transparent)]"
      />

      <div ref={ref} aria-hidden className="pointer-events-none select-none">
        {/* The NFC card, behind the phone. */}
        <motion.div {...enter(0.15)} className="absolute start-0 top-[112px] hidden sm:block">
          <div className="w-[236px] -rotate-[8deg] rtl:rotate-[8deg]">
            <ChipCard name={t('sample.name')} title={t('sample.title')} />
          </div>
        </motion.div>

        {/* The phone. */}
        <div className="absolute start-1/2 top-4 -translate-x-1/2 rtl:translate-x-1/2 sm:top-6">
          <div className="relative rounded-[46px] bg-[#101012] p-[9px] shadow-[0_40px_80px_-32px_rgba(23,23,26,0.5)] ring-1 ring-black/5 dark:ring-white/10">
            <span className="absolute -left-[2px] top-[120px] h-12 w-[2px] rounded-l bg-[#2a2a2e]" />
            <span className="absolute -right-[2px] top-[150px] h-16 w-[2px] rounded-r bg-[#2a2a2e]" />
            <div className="relative overflow-hidden rounded-[37px] bg-white" style={{ width: SCREEN_W, height: SCREEN_H }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: PHONE_WIDTH, height: SCREEN_H / SCALE, transform: `scale(${SCALE})`, transformOrigin: 'top left' }}>
                <PublicProfile profile={profile} preview />
              </div>
              <span className="absolute left-1/2 top-2 z-10 h-[22px] w-[76px] -translate-x-1/2 rounded-full bg-black" />
            </div>
          </div>
        </div>

        {/* The lead it brought in. */}
        <motion.div {...enter(0.7)} className="absolute bottom-6 end-0 sm:bottom-[92px] sm:end-[-8px]">
          <div className="w-[272px] rounded-xl bg-surface p-3.5 shadow-[0_24px_48px_-16px_rgba(23,23,26,0.28)] ring-1 ring-line">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Icon name="calendar" size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center justify-between gap-2 text-[12px] text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    {t('sample.lead.title')}
                  </span>
                  <span className="text-faint">{t('sample.lead.time')}</span>
                </p>
                <p className="mt-1 text-[13.5px] leading-snug text-ink">
                  <span className="font-medium">{t('sample.lead.name')}</span> {t('sample.lead.what')}
                </p>
                <p className="mt-0.5 text-[12px] text-faint">{t('sample.lead.via')}</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* On a phone the illustration is cropped; this lets it fade into the page. */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-canvas to-transparent sm:hidden" />
    </figure>
  );
}

function ChipCard({ name, title }: { name: string; title: string }) {
  return (
    <div className="relative aspect-[1.586] w-full overflow-hidden rounded-[14px] bg-[#17171a] p-4 text-white shadow-[0_24px_48px_-20px_rgba(23,23,26,0.55)] ring-1 ring-white/10 dark:bg-[#232327]">
      <div aria-hidden className="absolute -end-10 -top-16 h-40 w-40 rounded-full bg-accent/25 blur-2xl" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-accent">
            <VMark size={12} strokeWidth={3} />
          </span>
          <Contactless size={18} className="text-white/60" />
        </div>
        <div>
          <p className="text-[14px] font-medium leading-tight">{name}</p>
          <p className="mt-0.5 truncate text-[11px] text-white/55">{title}</p>
        </div>
      </div>
    </div>
  );
}
