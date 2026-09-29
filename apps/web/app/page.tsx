import type { Metadata } from 'next';
import { Landing } from '@/components/landing/Landing';
import { apiGet } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Vertex Connect · NFC business cards with a built-in pipeline',
  description:
    'Share your digital business card from an NFC chip or a QR code. Anyone who taps it sees your card with no app to install, and the details they leave go straight to your pipeline.',
};

/** Prices are settings on the API; a minute-old copy is fine for the home page. */
export const revalidate = 60;

export default async function Home() {
  const plans = await apiGet<{ prices: Record<'PRO' | 'BUSINESS', number | null> }>('/billing/plans');
  return <Landing prices={plans?.prices ?? { PRO: null, BUSINESS: null }} />;
}
