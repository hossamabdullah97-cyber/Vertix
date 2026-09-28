/**
 * The demo seed creates owner@vertex.dev, a platform admin whose password is
 * written in seed.ts for anyone who can read this repository. It must never
 * reach a real database, so it runs only against one on this machine, and
 * never in production, unless ALLOW_DEMO_SEED=1 says the database is a
 * throwaway one.
 *
 * "postgres", the database host inside docker-compose, is not treated as
 * local: it is also the host name of the production database there.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Why the demo seed must not run with this environment, or null when it may. */
export function seedRefusal(env: Record<string, string | undefined>): string | null {
  if (env.ALLOW_DEMO_SEED === '1') return null;
  if (env.NODE_ENV === 'production') return 'NODE_ENV is production';
  let host: string;
  try {
    host = new URL(env.DATABASE_URL ?? '').hostname;
  } catch {
    return 'DATABASE_URL is missing or is not a URL';
  }
  if (!LOCAL_HOSTS.has(host)) return `the database host "${host}" is not on this machine`;
  return null;
}

/** Stops the seed, before it touches the database, when it must not run. */
export function assertSeedAllowed(env: Record<string, string | undefined> = process.env): void {
  const why = seedRefusal(env);
  if (!why) return;
  console.error(
    [
      `Refusing to seed demo data: ${why}.`,
      'The demo seed creates owner@vertex.dev, a platform admin whose password is in this repository.',
      'It is for a local development database only. If this database is a throwaway one, run it again with ALLOW_DEMO_SEED=1.',
    ].join('\n'),
  );
  process.exit(1);
}
