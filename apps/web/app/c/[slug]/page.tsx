import { notFound } from 'next/navigation';
import { apiGet, type PublicCard, type PublicCardLocked } from '@/lib/api';
import { VMark } from '@/components/brand/VMark';
import { PasscodeGate } from '@/components/profile/PasscodeGate';
import ProfileHero from '@/components/profile/ProfileHero';
import PrimaryActions from '@/components/profile/PrimaryActions';
import EngagementPanel from '@/components/profile/EngagementPanel';
import { QuickActions } from '@/components/profile/ProfileLinks';
import PaymentLinks from '@/components/profile/PaymentLinks';
import SocialCards from '@/components/profile/SocialCards';
import ExpandableBio from '@/components/profile/ExpandableBio';
import { Reveal } from '@/components/profile/Reveal';
import TrackView from '@/components/TrackView';
import QrShareButton from '@/components/profile/QrShareButton';
import { PortfolioGallery } from '@/components/PortfolioGallery';
import { profileStrings, type Lang } from '@/lib/profileI18n';

export const dynamic = 'force-dynamic';

function pick(content: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const val = content[k];
    if (typeof val === 'string' && val) return val;
  }
  return '';
}
function contrastOf(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return '#ffffff';
  const lin = [1, 2, 3].map((i) => {
    const c = parseInt(m[i], 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return L > 0.6 ? '#141414' : '#ffffff';
}

export default async function CardPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { p?: string; code?: string };
}) {
  // Resolve which profile variant to serve: ?p=<key> targets a specific one,
  // optionally gated by ?code=<passcode>. No params → the default profile.
  const p = searchParams.p;
  const code = searchParams.code;
  const qs = new URLSearchParams();
  if (p) qs.set('p', p);
  if (code) qs.set('code', code);
  const query = qs.toString() ? `?${qs.toString()}` : '';

  const result = await apiGet<PublicCard | PublicCardLocked>(`/c/${params.slug}${query}`);
  if (!result) notFound();

  // Passcode-gated variant requested without (or with the wrong) code.
  if ('locked' in result && result.locked) {
    return (
      <PasscodeGate
        slug={params.slug}
        p={p ?? ''}
        profileName={result.profileName}
        wrongCode={Boolean(code)}
      />
    );
  }

  const card = result as PublicCard;
  const v = card.vcardData ?? {};
  const bio = card.sections.find((s) => s.type === 'BIO');
  // Identity is sourced from vcardData first (the Profile Settings tab is its
  // single editor); the BIO section is a fallback for older cards + the About.
  const name = (v.fullName as string) || (bio ? pick(bio.content, 'title', 'headline') : '') || 'Vertex Connect';
  const title = (v.org as string) || (bio ? pick(bio.content, 'subtitle') : '');
  const company = '';
  const about = bio ? pick(bio.content, 'body', 'about') : '';
  const avatar = (v.avatar as string) || '';
  const coverImage = (v.coverImage as string) || (card.theme?.coverImage as string) || '';
  const others = card.sections.filter((s) => s.type !== 'BIO');

  const accent = (card.theme?.accent as string) ?? '#1d4ed8';
  const accentContrast = contrastOf(accent);
  const mode = (card.theme?.mode as string) === 'dark' ? 'dark' : 'light';
  const lang: Lang = (card.theme?.lang as string) === 'ar' ? 'ar' : 'en';
  const dir = lang === 'ar' || (card.theme?.dir as string) === 'rtl' ? 'rtl' : 'ltr';
  const t = profileStrings(lang);
  const coverStyle = ((card.theme?.cover as string) || (mode === 'dark' ? 'constellation' : 'gradient')) as
    | 'constellation'
    | 'gradient'
    | 'solid';
  const circle = (card.theme?.avatarShape as string) !== 'square';

  // Optional trust / identity fields (rendered only when present in vcardData).
  const available = v.available === true ? t.available : typeof v.available === 'string' ? (v.available as string) : '';
  const hasSocial = card.actions.length > 0;

  return (
    <main
      dir={dir}
      data-theme={mode}
      style={{ '--v-accent': accent, '--v-accent-contrast': accentContrast, background: 'hsl(var(--v-bg))' } as React.CSSProperties}
      className="min-h-screen text-[hsl(var(--v-fg))]"
    >
      <TrackView slug={card.slug} />
      <QrShareButton name={name} lang={lang} />

      <div className="mx-auto w-full max-w-[500px] sm:px-4 sm:py-6">
        {card.profileName && (
          <div className="mb-2 flex justify-center px-4 sm:px-0">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold"
              style={{
                background: 'color-mix(in srgb, var(--v-accent) 10%, transparent)',
                borderColor: 'color-mix(in srgb, var(--v-accent) 25%, transparent)',
                color: 'var(--v-accent)',
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--v-accent)' }} />
              {card.profileName}
            </span>
          </div>
        )}
        <article
          className="overflow-hidden border-[hsl(var(--v-border))] bg-[hsl(var(--v-surface))] sm:rounded-[22px] sm:border"
          style={{ boxShadow: 'var(--v-shadow-lg)' }}
        >
          <ProfileHero
            name={name}
            title={title}
            company={company}
            avatar={avatar}
            accent={accent}
            contrast={accentContrast}
            coverImage={coverImage}
            coverStyle={coverStyle}
            circle={circle}
            verified={card.verified === true}
            available={available}
            location={(v.location as string) || ''}
            languages={(v.languages as string) || ''}
            responseTime={(v.responseTime as string) || ''}
            lang={lang}
          />

          <div className="space-y-7 px-5 pb-10 pt-6 sm:px-7">
            {/* Quick contact icons — centered row */}
            <Reveal delay={0.02}>
              <QuickActions actions={card.actions} slug={card.slug} />
            </Reveal>

            {/* Save Contact CTA */}
            <Reveal delay={0.06}>
              <PrimaryActions slug={card.slug} name={name} lang={lang} />
            </Reveal>

            {/* About */}
            {about && (
              <Reveal delay={0.08}>
                <Section label={t.aboutTitle}>
                  <div className="rounded-2xl border border-[hsl(var(--v-border))] bg-[hsl(var(--v-bg))] p-4">
                    <ExpandableBio text={about} />
                  </div>
                </Section>
              </Reveal>
            )}

            {/* Social / links — icon grid */}
            {hasSocial && (
              <Reveal delay={0.1}>
                <Section label={t.connectTitle}>
                  <SocialCards actions={card.actions} slug={card.slug} />
                </Section>
              </Reveal>
            )}

            {/* Payment links — external, link-sharing only */}
            {card.paymentLinks.length > 0 && (
              <Reveal delay={0.11}>
                <Section label={t.paymentsTitle}>
                  <PaymentLinks links={card.paymentLinks} slug={card.slug} profileName={card.profileName} />
                </Section>
              </Reveal>
            )}

            {/* Lead capture + booking */}
            <Reveal delay={0.12}>
              <EngagementPanel slug={card.slug} lang={lang} />
            </Reveal>

            {/* Extra sections */}
            {others.map((s, i) => {
              const sTitle = pick(s.content, 'title') || s.type;

              if (s.type === 'VIDEO') {
                const raw = pick(s.content, 'videoUrl');
                if (!raw) return null;
                const ytMatch = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
                const vimeoMatch = raw.match(/vimeo\.com\/(\d+)/);
                const embedUrl = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}` : vimeoMatch ? `https://player.vimeo.com/video/${vimeoMatch[1]}` : null;
                if (!embedUrl) return null;
                return (
                  <Reveal key={s.id} delay={0.14 + i * 0.03}>
                    <Section label={sTitle}>
                      <div className="overflow-hidden rounded-2xl border border-[hsl(var(--v-border))] aspect-video">
                        <iframe src={embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                      </div>
                    </Section>
                  </Reveal>
                );
              }

              if (s.type === 'PORTFOLIO') {
                const images = Array.isArray(s.content.images) ? (s.content.images as string[]) : [];
                if (images.length === 0) return null;
                return (
                  <Reveal key={s.id} delay={0.14 + i * 0.03}>
                    <Section label={sTitle}>
                      <PortfolioGallery images={images} />
                    </Section>
                  </Reveal>
                );
              }

              if (s.type === 'BOOKING') {
                const bookingUrl = pick(s.content, 'bookingUrl');
                if (!bookingUrl) return null;
                const buttonLabel = pick(s.content, 'buttonLabel') || 'Book a meeting';
                return (
                  <Reveal key={s.id} delay={0.14 + i * 0.03}>
                    <Section label={sTitle}>
                      <a
                        href={bookingUrl.startsWith('http') ? bookingUrl : `https://${bookingUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[hsl(var(--v-border))] bg-[hsl(var(--v-surface))] text-[14px] font-semibold transition-transform active:scale-[0.98]"
                      >
                        <span style={{ color: 'var(--v-accent)' }}>📅</span>
                        {buttonLabel}
                      </a>
                    </Section>
                  </Reveal>
                );
              }

              // Generic text fallback (SOCIAL or unknown)
              const body = pick(s.content, 'body');
              if (!body) return null;
              return (
                <Reveal key={s.id} delay={0.14 + i * 0.03}>
                  <Section label={sTitle}>
                    <p className="rounded-2xl border border-[hsl(var(--v-border))] bg-[hsl(var(--v-bg))] p-4 text-[14px] leading-relaxed">
                      {body}
                    </p>
                  </Section>
                </Reveal>
              );
            })}

            <footer className="flex items-center justify-center gap-1.5 pt-4 text-[11.5px] text-[hsl(var(--v-faint))]">
              <span style={{ color: 'var(--v-accent)' }}>
                <VMark size={13} strokeWidth={3} />
              </span>
              {t.poweredBy} <span className="font-semibold text-[hsl(var(--v-muted))]">Vertex Connect</span>
            </footer>
          </div>
        </article>
      </div>
    </main>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-[hsl(var(--v-border))]" />
        <span className="text-[12px] font-semibold text-[hsl(var(--v-muted))]">{label}</span>
        <span className="h-px flex-1 bg-[hsl(var(--v-border))]" />
      </div>
      {children}
    </section>
  );
}
