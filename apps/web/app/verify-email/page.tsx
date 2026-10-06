import type { Metadata } from 'next';
import { VerifyEmail } from '@/components/auth/VerifyEmail';

export const metadata: Metadata = { title: 'Confirm your email · Vertex Connect' };

export default async function VerifyEmailPage(props: { searchParams: Promise<{ token?: string }> }) {
  const searchParams = await props.searchParams;
  return <VerifyEmail token={typeof searchParams.token === 'string' ? searchParams.token : ''} />;
}
