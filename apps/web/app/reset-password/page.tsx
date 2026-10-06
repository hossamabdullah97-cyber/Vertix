import type { Metadata } from 'next';
import { ResetForm } from '@/components/auth/ResetForm';

export const metadata: Metadata = { title: 'Choose a new password · Vertex Connect' };

export default async function ResetPasswordPage(props: { searchParams: Promise<{ token?: string }> }) {
  const searchParams = await props.searchParams;
  return <ResetForm token={typeof searchParams.token === 'string' ? searchParams.token : ''} />;
}
