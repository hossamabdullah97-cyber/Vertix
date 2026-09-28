import type { Metadata } from 'next';
import { ResetForm } from '@/components/auth/ResetForm';

export const metadata: Metadata = { title: 'Choose a new password · Vertex Connect' };

export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  return <ResetForm token={typeof searchParams.token === 'string' ? searchParams.token : ''} />;
}
