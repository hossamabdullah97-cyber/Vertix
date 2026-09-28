import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';

type Search = { mode?: string; next?: string; expired?: string };

export function generateMetadata({ searchParams }: { searchParams: Search }): Metadata {
  return { title: searchParams.mode === 'register' ? 'Create your account · Vertex Connect' : 'Sign in · Vertex Connect' };
}

// The side, the return path and the "session ended" note come from the
// address, read here so the page renders the right side from the start.
export default function LoginPage({ searchParams }: { searchParams: Search }) {
  return (
    <LoginForm
      initialMode={searchParams.mode === 'register' ? 'register' : 'login'}
      next={typeof searchParams.next === 'string' ? searchParams.next : null}
      expired={searchParams.expired === '1'}
    />
  );
}
