'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getActiveOrgId, getToken, type Card } from '@/lib/client';
import { PublicProfile } from '@/components/profile/PublicProfile';
import type { PaymentLinkRow } from '@/components/cards/PaymentLinksManager';
import { buildProfile, type CardBrand } from '@/lib/profile';
import { profileStrings } from '@/lib/profileI18n';

/**
 * A card as its visitors see it, drafts included, for the people who may edit
 * it: what the phone app's Preview opens. Built as the Studio's live preview
 * builds it, and `preview`, so nothing is tracked or sent from here.
 */
export default function CardPreview(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const router = useRouter();
  const [card, setCard] = useState<Card | null>(null);
  const [paymentLinks, setPaymentLinks] = useState<PaymentLinkRow[]>([]);
  const [brand, setBrand] = useState<CardBrand | null>(null);
  const [error, setError] = useState('');
  // The card's language on screen, when it has two; the switch on the card sets it.
  const [viewLang, setViewLang] = useState<'en' | 'ar' | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    authFetch<Card>(`/cards/${id}`)
      .then(setCard)
      .catch((e: Error) => setError(e.message));
    authFetch<PaymentLinkRow[]>(`/cards/${id}/payment-links`)
      .then(setPaymentLinks)
      .catch(() => {});
    if (getActiveOrgId()) {
      authFetch<{ name: string; branding: Record<string, unknown> | null }>('/orgs/current')
        .then((o) =>
          setBrand({
            name: o.name,
            logo: typeof o.branding?.logo === 'string' && o.branding.logo ? o.branding.logo : null,
          }),
        )
        .catch(() => {});
    }
  }, [id, router]);

  const profile = useMemo(
    () =>
      card &&
      buildProfile({
        slug: card.slug,
        brand,
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
    [card, brand, paymentLinks, viewLang],
  );

  if (error) return <p className="px-6 py-16 text-center text-sm text-muted">{error}</p>;
  if (!profile) return <div className="h-[100dvh]" aria-busy />;
  return (
    <div className="h-[100dvh]">
      <PublicProfile profile={profile} preview onLang={setViewLang} />
    </div>
  );
}
