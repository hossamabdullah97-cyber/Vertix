import type { Metadata } from 'next';
import { InviteForm } from '@/components/auth/InviteForm';

export const metadata: Metadata = { title: 'Join your team · Vertex Connect' };

export default function AcceptInvitePage({ searchParams }: { searchParams: { token?: string } }) {
  return <InviteForm token={typeof searchParams.token === 'string' ? searchParams.token : ''} />;
}
