import type { Metadata } from 'next';
import { SsoForm } from '@/components/auth/SsoForm';

export const metadata: Metadata = { title: 'Sign in with your company · Vertex Connect' };

export default async function SsoPage(props: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const searchParams = await props.searchParams;
  return <SsoForm next={typeof searchParams.next === 'string' ? searchParams.next : null} initialEmail={typeof searchParams.email === 'string' ? searchParams.email : ''} />;
}
