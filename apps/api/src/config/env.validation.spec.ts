import { validateEnv } from './env.validation';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', JWT_SECRET: 'x'.repeat(16), JWT_REFRESH_SECRET: 'y'.repeat(16) };

describe('validateEnv', () => {
  it('takes a blank variable as not set, as a hosting panel leaves unused keys', () => {
    const env = validateEnv({ ...base, REDIS_URL: '', API_PUBLIC_URL: '  ', PORT: '' });
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.API_PUBLIC_URL).toBeUndefined();
    expect(env.PORT).toBe(4000);
  });

  it('still refuses a wrong value, and a missing required one', () => {
    expect(() => validateEnv({ ...base, REDIS_URL: 'not a url' })).toThrow('REDIS_URL');
    expect(() => validateEnv({ ...base, DATABASE_URL: '' })).toThrow('DATABASE_URL');
  });
});
