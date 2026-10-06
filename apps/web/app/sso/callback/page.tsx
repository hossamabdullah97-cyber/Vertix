import type { Metadata } from 'next';
import { SsoCallback } from '@/components/auth/SsoCallback';

export const metadata: Metadata = { title: 'Signing in · Vertex Connect' };

type Search = { code?: string; state?: string; error?: string; error_description?: string };

export default async function SsoCallbackPage(props: { searchParams: Promise<Search> }) {
  const searchParams = await props.searchParams;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return (
    <SsoCallback
      code={str(searchParams.code)}
      state={str(searchParams.state)}
      providerError={str(searchParams.error_description) ?? str(searchParams.error)}
    />
  );
}
