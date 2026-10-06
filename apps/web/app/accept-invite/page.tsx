import type { Metadata } from 'next';
import { InviteForm } from '@/components/auth/InviteForm';

export const metadata: Metadata = { title: 'Join your team · Vertex Connect' };

export default async function AcceptInvitePage(props: { searchParams: Promise<{ token?: string }> }) {
  const searchParams = await props.searchParams;
  return <InviteForm token={typeof searchParams.token === 'string' ? searchParams.token : ''} />;
}
