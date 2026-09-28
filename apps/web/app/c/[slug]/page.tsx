import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiGet, type PublicCard, type PublicCardLocked } from '@/lib/api';
import { buildProfile, profileStyle } from '@/lib/profile';
import { PasscodeGate } from '@/components/profile/PasscodeGate';
import { PublicProfile } from '@/components/profile/PublicProfile';
import TrackView from '@/components/TrackView';

export const dynamic = 'force-dynamic';

type Search = { p?: string; code?: string; t?: string };

function variantQuery(searchParams: Search) {
  const qs = new URLSearchParams();
  if (searchParams.p) qs.set('p', searchParams.p);
  if (searchParams.code) qs.set('code', searchParams.code);
  return qs.toString() ? `?${qs}` : '';
}

/** Name, role and photo for link previews in messaging apps. */
export async function generateMetadata({ params, searchParams }: { params: { slug: string }; searchParams: Search }): Promise<Metadata> {
  const result = await apiGet<PublicCard | PublicCardLocked>(`/c/${params.slug}${variantQuery(searchParams)}`);
  if (!result || ('locked' in result && result.locked)) return { title: 'Vertex Connect', robots: { index: false } };
  const card = result as PublicCard;
  const p = buildProfile({ ...card, sections: card.sections, actions: card.actions, paymentLinks: card.paymentLinks });
  const description = p.title || p.about.slice(0, 160) || undefined;
  return {
    title: p.name,
    description,
    openGraph: { title: p.name, description, type: 'profile', images: p.avatar ? [{ url: p.avatar }] : undefined },
    twitter: { card: 'summary', title: p.name, description },
  };
}

export default async function CardPage({ params, searchParams }: { params: { slug: string }; searchParams: Search }) {
  // ?p targets a profile variant, optionally with ?code for a passcode; ?t is
  // the chip a visitor tapped, carried into anything they send.
  const result = await apiGet<PublicCard | PublicCardLocked>(`/c/${params.slug}${variantQuery(searchParams)}`);
  if (!result) notFound();

  if ('locked' in result && result.locked) {
    return <PasscodeGate slug={params.slug} p={searchParams.p ?? ''} profileName={result.profileName} wrongCode={Boolean(searchParams.code)} />;
  }

  const card = result as PublicCard;
  const profile = buildProfile({
    slug: card.slug,
    theme: card.theme,
    vcardData: card.vcardData,
    sections: card.sections,
    actions: card.actions,
    paymentLinks: card.paymentLinks,
    verified: card.verified,
    profileName: card.profileName,
  });

  return (
    <main
      style={profileStyle(profile)}
      className="min-h-[100dvh] bg-[var(--p-surface)] sm:bg-[var(--p-bg)] sm:px-4 sm:py-10"
    >
      <TrackView slug={card.slug} />
      {/* A phone gets the card edge to edge; a wider screen sees it as a card. */}
      <div className="mx-auto w-full max-w-[440px] overflow-hidden sm:rounded-[20px] sm:shadow-[0_0_0_1px_var(--p-line),0_24px_48px_-24px_rgba(0,0,0,0.25)]">
        <PublicProfile profile={profile} query={{ p: searchParams.p, code: searchParams.code, t: searchParams.t }} />
      </div>
    </main>
  );
}
