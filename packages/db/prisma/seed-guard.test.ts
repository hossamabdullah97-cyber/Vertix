import { describe, expect, it } from 'vitest';
import { seedRefusal } from './seed-guard';

const local = 'postgresql://vertex:vertex@localhost:5432/vertex_connect?schema=public';

describe('seedRefusal', () => {
  it('lets the demo seed run on a database on this machine', () => {
    expect(seedRefusal({ DATABASE_URL: local })).toBeNull();
    expect(seedRefusal({ DATABASE_URL: local.replace('localhost', '127.0.0.1'), NODE_ENV: 'development' })).toBeNull();
  });

  it('refuses in production, whatever the database', () => {
    expect(seedRefusal({ DATABASE_URL: local, NODE_ENV: 'production' })).toMatch(/production/);
  });

  it('refuses a database on another host, the compose "postgres" host included', () => {
    expect(seedRefusal({ DATABASE_URL: 'postgresql://u:p@db.example.com:5432/app' })).toMatch(/db\.example\.com/);
    expect(seedRefusal({ DATABASE_URL: 'postgresql://u:p@postgres:5432/app' })).toMatch(/"postgres"/);
  });

  it('refuses when it cannot tell where the database is', () => {
    expect(seedRefusal({})).toMatch(/DATABASE_URL/);
    expect(seedRefusal({ DATABASE_URL: 'not a url' })).toMatch(/DATABASE_URL/);
  });

  it('runs anywhere when ALLOW_DEMO_SEED=1 says the database is a throwaway', () => {
    expect(seedRefusal({ DATABASE_URL: 'postgresql://u:p@postgres:5432/app', NODE_ENV: 'production', ALLOW_DEMO_SEED: '1' })).toBeNull();
    expect(seedRefusal({ DATABASE_URL: 'postgresql://u:p@postgres:5432/app', ALLOW_DEMO_SEED: 'yes' })).not.toBeNull();
  });
});
