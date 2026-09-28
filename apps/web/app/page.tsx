import type { Metadata } from 'next';
import { Landing } from '@/components/landing/Landing';

export const metadata: Metadata = {
  title: 'Vertex Connect · NFC business cards with a built-in pipeline',
  description:
    'Share your digital business card from an NFC chip or a QR code. Anyone who taps it sees your card with no app to install, and the details they leave go straight to your pipeline.',
};

export default function Home() {
  return <Landing />;
}
