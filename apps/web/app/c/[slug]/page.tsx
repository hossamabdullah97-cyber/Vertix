import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { apiGet, forwardedFor, type PublicCard, type PublicCardLocked } from '@/lib/api';
import { altOf, buildProfile, pickViewLang, profileAttrs, profileStyle } from '@/lib/profile';
import { CardCompanion } from '@/components/profile/CardCompanion';
import { PasscodeGate } from '@/components/profile/PasscodeGate';
import { PublicProfile } from '@/components/profile/PublicProfile';
import TrackView from '@/components/TrackView';
import { ClearAppTheme } from '@/components/profile/ClearAppTheme';

export const dynamic = 'force-dynamic';

type Search = { p?: string; code?: string; t?: string; lang?: string };

function variantQuery(searchParams: Search) {
  const qs = new URLSearchParams();
  if (searchParams.p) qs.set('p', searchParams.p);
  if (searchParams.code) qs.set('code', searchParams.code);
  return qs.toString() ? `?${qs}` : '';
}

/**
 * The language a visitor sees: ?lang when the card has it, else the one their
 * browser prefers among the card's, else the card's own.
 */
async function viewLangOf(card: PublicCard, searchParams: Search) {
  const primary = card.theme?.lang === 'ar' ? 'ar' : 'en';
  const alt = altOf(card.vcardData, primary);
  return pickViewLang(alt ? [primary, alt.lang] : [primary], searchParams.lang, (await headers()).get('accept-language'));
}

/**
 * The site's own address, as the visitor reached it, so the preview picture's
 * link is absolute (messaging apps need that) behind any proxy.
 */
async function siteBase(): Promise<URL | undefined> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return undefined;
  const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? (host.startsWith('localhost') ? 'http' : 'https');
  try {
    return new URL(`${proto}://${host}`);
  } catch {
    return undefined;
  }
}

/**
 * Name, role and company for link previews in messaging apps. The picture is
 * drawn by opengraph-image.tsx next to this page.
 */
export async function generateMetadata(
  props: { params: Promise<{ slug: string }>; searchParams: Promise<Search> }
): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const result = await apiGet<PublicCard | PublicCardLocked>(`/c/${params.slug}${variantQuery(searchParams)}`, forwardedFor(await headers()));
  if (!result || ('locked' in result && result.locked)) return { title: 'Vertex Connect', robots: { index: false } };
  const card = result as PublicCard;
  const p = buildProfile({ ...card, brand: card.brand ?? null, viewLang: await viewLangOf(card, searchParams) });
  const role = [p.title, p.company || p.brand?.name].filter(Boolean).join(' · ');
  const description = role || p.about.slice(0, 160) || undefined;
  return {
    metadataBase: await siteBase(),
    title: p.name,
    description,
    openGraph: { title: p.name, description, type: 'profile', siteName: 'Vertex Connect' },
    twitter: { card: 'summary_large_image', title: p.name, description },
  };
}

/**
 * The person on the card as schema.org data, so search engines show the name,
 * role and company rightly. Only what the card itself shows.
 */
function personData(profile: ReturnType<typeof buildProfile>, card: PublicCard) {
  const v = (card.vcardData ?? {}) as Record<string, unknown>;
  const company = profile.company || profile.brand?.name;
  const links = card.actions
    .map((a) => (typeof a.config?.url === 'string' ? a.config.url : ''))
    .filter((u) => /^https?:\/\//.test(u));
  // The name in the card's other language, for search in either script.
  const primary = card.theme?.lang === 'ar' ? 'ar' : 'en';
  const names = [typeof v.fullName === 'string' ? v.fullName.trim() : '', altOf(card.vcardData, primary)?.fields.fullName ?? ''];
  const alternateName = names.find((n) => n && n !== profile.name);
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.name,
    ...(alternateName ? { alternateName } : {}),
    ...(profile.title ? { jobTitle: profile.title } : {}),
    ...(company ? { worksFor: { '@type': 'Organization', name: company } } : {}),
    ...(/^https?:\/\//.test(profile.avatar) ? { image: profile.avatar } : {}),
    ...(profile.about ? { description: profile.about.slice(0, 300) } : {}),
    ...(typeof v.email === 'string' && v.email ? { email: v.email } : {}),
    ...(typeof v.phone === 'string' && v.phone ? { telephone: v.phone } : {}),
    ...(profile.meta.location ? { address: { '@type': 'PostalAddress', addressLocality: profile.meta.location } } : {}),
    ...(links.length ? { sameAs: links } : {}),
  };
}

export default async function CardPage(
  props: { params: Promise<{ slug: string }>; searchParams: Promise<Search> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  // ?p targets a profile variant, optionally with ?code for a passcode; ?t is
  // the chip a visitor tapped, carried into anything they send.
  const result = await apiGet<PublicCard | PublicCardLocked>(`/c/${params.slug}${variantQuery(searchParams)}`, forwardedFor(await headers()));
  if (!result) notFound();

  if ('locked' in result && result.locked) {
    return (
      <>
        <ClearAppTheme />
        <PasscodeGate slug={params.slug} p={searchParams.p ?? ''} profileName={result.profileName} look={result.look} wrongCode={Boolean(searchParams.code)} />
      </>
    );
  }

  const card = result as PublicCard;
  const profile = buildProfile({
    viewLang: await viewLangOf(card, searchParams),
    slug: card.slug,
    theme: card.theme,
    vcardData: card.vcardData,
    sections: card.sections,
    actions: card.actions,
    paymentLinks: card.paymentLinks,
    verified: card.verified,
    brand: card.brand ?? null,
    wallet: card.wallet,
    privacyUrl: card.privacyUrl ?? null,
    profileName: card.profileName,
  });

  return (
    <main
      style={profileStyle(profile)}
      {...profileAttrs(profile)}
      className="min-h-[100dvh] bg-[var(--p-surface)] sm:bg-[var(--p-bg)] sm:px-4 sm:py-10"
    >
      <TrackView slug={card.slug} />
      <ClearAppTheme />
      <script
        type="application/ld+json"
        // "<" is escaped so nothing typed into the card can end the script.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personData(profile, card)).replace(/</g, '\\u003c') }}
      />
      {/* A phone gets the card edge to edge; a wider screen sees it as a card,
          and a computer also gets the code to carry it to a phone. */}
      <div dir={profile.lang === 'ar' ? 'rtl' : 'ltr'} className="mx-auto flex w-full max-w-[440px] items-start justify-center gap-8 lg:max-w-[740px]">
        <div className="w-full max-w-[440px] overflow-hidden sm:rounded-[20px] sm:shadow-[0_0_0_1px_var(--p-line),0_24px_48px_-24px_rgba(0,0,0,0.25)]">
          <PublicProfile profile={profile} query={{ p: searchParams.p, code: searchParams.code, t: searchParams.t }} />
        </div>
        <CardCompanion slug={card.slug} lang={profile.lang} variant={searchParams.p} />
      </div>
    </main>
  );
}
