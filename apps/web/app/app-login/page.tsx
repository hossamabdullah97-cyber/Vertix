import type { Metadata } from 'next';
import { AppLogin } from '@/components/auth/AppLogin';

export const metadata: Metadata = { title: 'Sign in to the app · Vertex Connect', robots: { index: false } };

/** Where the phone app sends someone to sign in (any way the website offers), and back. */
export default async function AppLoginPage(props: { searchParams: Promise<{ challenge?: string }> }) {
  const { challenge } = await props.searchParams;
  return <AppLogin challenge={typeof challenge === 'string' ? challenge : null} />;
}
