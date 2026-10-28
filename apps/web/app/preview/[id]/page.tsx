'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { authFetch, getActiveOrgId, getToken, type Card } from '@/lib/client';
import { PublicProfile } from '@/components/profile/PublicProfile';
import type { PaymentLinkRow } from '@/components/cards/PaymentLinksManager';
import { buildProfile, type CardBrand } from '@/lib/profile';
import { profileStrings } from '@/lib/profileI18n';
import { isPaidPlan, type Plan } from '@vertex/shared';

/** What the phone app's editor sends while someone edits: the card as it stands, saved or not. */
interface LiveCard {
  card: Card;
  brand?: CardBrand | null;
}

declare global {
  interface Window {
    /** Called by the app (react-native-webview injects it) with each change. */
    __vertexPreview?: (live: LiveCard) => void;
    /** A change sent before this page was ready for it. */
    __vertexPreviewPending?: LiveCard;
  }
}

/**
 * A card as its visitors see it, drafts included: what the phone app shows
 * at the top of its card editor and in its Preview. Built as the Studio's
 * live preview builds it, and `preview`, so nothing is tracked or sent.
 *
 * Outside the signed-in paths on purpose: the page holds nothing itself. The
 * card comes from the API with the app's session (handed to the page before
 * it loads), and with `?live=1` from the app as it is being edited.
 */
export default function CardPreview(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const [live, setLive] = useState(false);
  const [saved, setSaved] = useState<Card | null>(null);
  const [sent, setSent] = useState<LiveCard | null>(null);
  const [paymentLinks, setPaymentLinks] = useState<PaymentLinkRow[]>([]);
  const [brand, setBrand] = useState<CardBrand | null>(null);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  // The card's language on screen, when it has two; the switch on the card sets it.
  const [viewLang, setViewLang] = useState<'en' | 'ar' | null>(null);

  useEffect(() => {
    const isLive = new URLSearchParams(window.location.search).get('live') === '1';
    setLive(isLive);
    if (isLive) {
      window.__vertexPreview = (next) => setSent(next);
      if (window.__vertexPreviewPending) setSent(window.__vertexPreviewPending);
    }
    // The app's browser build shows this page in a frame, and posts to it.
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || e.data?.type !== 'vertex-preview') return;
      setSent(e.data.live as LiveCard);
    };
    window.addEventListener('message', onMessage);

    if (getToken()) {
      authFetch<Card>(`/cards/${id}`)
        .then(setSaved)
        .catch((e: Error) => !isLive && setError(e.message));
      authFetch<PaymentLinkRow[]>(`/cards/${id}/payment-links`)
        .then(setPaymentLinks)
        .catch(() => {});
      if (getActiveOrgId()) {
        authFetch<{ name: string; plan: Plan; branding: Record<string, unknown> | null }>('/orgs/current')
          .then((o) => {
            setBrand({
              name: o.name,
              logo:
                typeof o.branding?.logo === 'string' && o.branding.logo ? o.branding.logo : null,
            });
            // The verified badge, as the plan earns it on the published card.
            setVerified(isPaidPlan(o.plan));
          })
          .catch(() => {});
      }
    } else if (!isLive) {
      window.location.replace(`/login?next=${encodeURIComponent(`/preview/${id}`)}`);
    }
    return () => {
      window.removeEventListener('message', onMessage);
      delete window.__vertexPreview;
    };
  }, [id]);

  const card = sent?.card ?? (live ? null : saved);
  const profile = useMemo(
    () =>
      card &&
      buildProfile({
        slug: card.slug,
        brand: sent?.brand !== undefined ? sent.brand : brand,
        verified,
        theme: card.theme,
        vcardData: card.vcardData,
        sections: card.sections ?? [],
        actions: (card.actions ?? []).filter((a) => a.isActive),
        paymentLinks: paymentLinks
          .filter((l) => l.isActive !== false)
          .map((l, i) => ({
            id: l.id,
            platform: l.platform,
            displayName: l.displayName,
            url: l.url ?? '#',
            description: l.description ?? null,
            order: l.order ?? i,
          })),
        fallbackName: profileStrings(card.theme?.lang === 'ar' ? 'ar' : 'en').yourName,
        viewLang,
      }),
    [card, sent, brand, verified, paymentLinks, viewLang],
  );

  if (error) return <p className="px-6 py-16 text-center text-sm text-muted">{error}</p>;
  if (!profile) return <div className="h-[100dvh]" aria-busy />;
  return (
    <div className="h-[100dvh]">
      <PublicProfile profile={profile} preview onLang={setViewLang} />
    </div>
  );
}
