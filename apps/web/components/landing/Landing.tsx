import { Suspense } from 'react';
import { getT, serverLocale } from '@/lib/i18n/server';
import { Icon } from '@/components/Icon';
import { Header } from './Header';
import { ClosingActions, HeroActions } from './LandingActions';
import { HeroVisual } from './HeroVisual';
import { Product } from './Product';
import { Pricing } from './Pricing';
import { Faq } from './Faq';
import { Footer } from './Footer';
import { Contactless, SectionHead, WRAP } from './shared';

/**
 * The home page. It renders on the server: only the header, the hero's card
 * and the sign-in-dependent buttons are client components, so a first visit
 * hydrates a small part of the page. The theme is on <html> (see
 * lib/themeScript.ts).
 */
export function Landing({ prices }: { prices: Partial<Record<'PERSONAL' | 'PRO' | 'BUSINESS', number | null>> }) {
  return (
    <div className="min-h-screen bg-canvas text-ink antialiased">
      <Suspense fallback={null}>
        <Header />
      </Suspense>
      <main>
        <Hero />
        <Product />
        <How />
        <Pricing prices={prices} />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

function Hero() {
  const t = getT(serverLocale(), 'landing');
  return (
    <section aria-labelledby="hero-title">
      <div className={`${WRAP} grid items-center gap-8 pb-16 pt-10 sm:pt-16 lg:grid-cols-2 lg:gap-6 lg:pb-20 lg:pt-16`}>
        <div className="max-w-xl">
          <p className="inline-flex h-7 items-center gap-2 rounded-full bg-surface px-3 text-xs text-muted ring-1 ring-line">
            <Contactless size={13} className="text-accent" />
            {t('hero.eyebrow')}
          </p>
          <h1 id="hero-title" className="mt-6 text-[38px] font-semibold leading-[1.06] tracking-[-0.035em] text-ink sm:text-[52px] lg:text-[56px] rtl:leading-[1.3] rtl:tracking-normal">
            {t('hero.title')}
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted sm:text-lg">{t('hero.subtitle')}</p>
          <HeroActions />
          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            {(['free', 'phones', 'languages'] as const).map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <Icon name="check" size={14} className="text-accent" />
                {t(`hero.facts.${k}`)}
              </li>
            ))}
          </ul>
        </div>
        {/* Its own boundary, so React hydrates the card in the phone in a task of its
            own and lets the browser in between, rather than in one long block with
            the rest of the page. Nothing in it waits, so the server still renders it
            straight into the HTML. */}
        <Suspense fallback={null}>
          <HeroVisual />
        </Suspense>
      </div>
    </section>
  );
}

const STEPS = ['create', 'share', 'follow'] as const;

function How() {
  const t = getT(serverLocale(), 'landing');
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-16 border-y border-line bg-surface py-20 sm:py-28">
      <div className={WRAP}>
        <SectionHead id="how-title" label={t('how.label')} title={t('how.title')} />
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <li key={s}>
              <div className="flex items-center gap-4">
                <span className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-base font-semibold text-accent">{i + 1}</span>
                {i < STEPS.length - 1 && <span aria-hidden className="hidden h-px flex-1 bg-line md:block" />}
              </div>
              <h3 className="mt-5 text-lg font-semibold text-ink">{t(`how.steps.${s}.title`)}</h3>
              <p className="mt-1.5 max-w-xs text-base leading-relaxed text-muted">{t(`how.steps.${s}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Closing() {
  const t = getT(serverLocale(), 'landing');
  return (
    <section aria-labelledby="cta-title" className="pb-20 sm:pb-28">
      <div className={WRAP}>
        <div className="relative flex flex-col gap-8 overflow-hidden rounded-2xl bg-surface px-6 py-10 ring-1 ring-line sm:px-12 sm:py-14 lg:flex-row lg:items-center lg:justify-between">
          <div
            aria-hidden
            className="absolute inset-y-0 end-0 w-1/2 [background-image:radial-gradient(hsl(var(--v-border-strong))_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_left,black,transparent)] rtl:[mask-image:linear-gradient(to_right,black,transparent)]"
          />
          <div className="relative max-w-xl">
            <h2 id="cta-title" className="text-4xl font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-5xl rtl:leading-snug rtl:tracking-normal">
              {t('cta.title')}
            </h2>
            <p className="mt-2 text-md leading-relaxed text-muted">{t('cta.body')}</p>
          </div>
          <ClosingActions />
        </div>
      </div>
    </section>
  );
}
