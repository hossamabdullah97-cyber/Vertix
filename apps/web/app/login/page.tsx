import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';

type Search = { mode?: string; next?: string; expired?: string; kind?: string };

export async function generateMetadata(props: { searchParams: Promise<Search> }): Promise<Metadata> {
  const searchParams = await props.searchParams;
  return { title: searchParams.mode === 'register' ? 'Create your account · Vertex Connect' : 'Sign in · Vertex Connect' };
}

// The side, the return path and the "session ended" note come from the
// address, read here so the page renders the right side from the start.
export default async function LoginPage(props: { searchParams: Promise<Search> }) {
  const searchParams = await props.searchParams;
  return (
    <LoginForm
      initialMode={searchParams.mode === 'register' ? 'register' : 'login'}
      next={typeof searchParams.next === 'string' ? searchParams.next : null}
      expired={searchParams.expired === '1'}
      initialKind={searchParams.kind === 'personal' || searchParams.kind === 'team' ? searchParams.kind : null}
    />
  );
}
