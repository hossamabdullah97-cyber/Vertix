import { describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'node:crypto';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  getRandomBytes: (n: number) => new Uint8Array(n).fill(251),
  digestStringAsync: async (_a: string, data: string) => require('node:crypto').createHash('sha256').update(data).digest('base64'),
}));
jest.mock('expo-web-browser', () => ({}));
jest.mock('./api', () => ({}));
jest.mock('./config', () => ({ WEB_BASE: 'https://app.example.com' }));
import { pkcePair } from './web-sign-in';

describe('pkcePair', () => {
  it('makes a verifier the API accepts, and the challenge the API checks it against', async () => {
    const { verifier, challenge } = await pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // What the API computes (auth.service redeemAppHandoff): base64url SHA-256 of the verifier.
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });

  it('is different every time', async () => {
    let n = 0;
    const a = await pkcePair(() => new Uint8Array(32).fill(++n));
    const b = await pkcePair(() => new Uint8Array(32).fill(++n));
    expect(a.verifier).not.toBe(b.verifier);
  });
});
