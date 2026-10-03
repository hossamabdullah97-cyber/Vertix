import type { Metadata } from 'next';
import { VerifyEmail } from '@/components/auth/VerifyEmail';

export const metadata: Metadata = { title: 'Confirm your email · Vertex Connect' };

export default function VerifyEmailPage({ searchParams }: { searchParams: { token?: string } }) {
  return <VerifyEmail token={typeof searchParams.token === 'string' ? searchParams.token : ''} />;
}
