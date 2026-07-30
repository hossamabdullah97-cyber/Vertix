import { ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { CredentialVault } from './credential-vault.service';

/**
 * The vault is the only thing standing between a database dump and every
 * customer's OAuth tokens. These assert the security properties directly:
 * ciphertext is non-deterministic, tampering fails loudly, the wrong key fails,
 * and a ciphertext bound to one tenant cannot be replayed against another.
 */

const KEY_A = randomBytes(32).toString('base64');
const KEY_B = randomBytes(32).toString('base64');

/** A vault wired with a fixed key, or no key at all. */
function vault(key?: string) {
  const config = { get: (_k: string) => key } as unknown as import('@nestjs/config').ConfigService;
  return new CredentialVault(config);
}

describe('CredentialVault — configuration', () => {
  it('is disabled and never throws at construction when no key is set', () => {
    expect(vault(undefined).enabled).toBe(false);
  });

  it('is disabled when the key is not 32 bytes', () => {
    expect(vault(randomBytes(16).toString('base64')).enabled).toBe(false);
    expect(vault(randomBytes(48).toString('base64')).enabled).toBe(false);
  });

  it('is disabled when the key is not valid base64 length', () => {
    expect(vault('not-a-real-key').enabled).toBe(false);
  });

  it('is enabled with a valid 32-byte base64 key', () => {
    expect(vault(KEY_A).enabled).toBe(true);
  });

  it('refuses to encrypt or decrypt while disabled — never stores plaintext', () => {
    const v = vault(undefined);
    expect(() => v.encrypt('secret')).toThrow(ServiceUnavailableException);
    expect(() => v.decrypt('v1:a:b:c')).toThrow(ServiceUnavailableException);
  });
});

describe('CredentialVault — round trip', () => {
  it('decrypts back to exactly what was encrypted', () => {
    const v = vault(KEY_A);
    const secret = 'ya29.a0AfB_byC-super-secret-oauth-token';
    expect(v.decrypt(v.encrypt(secret))).toBe(secret);
  });

  it('round-trips unicode and long values', () => {
    const v = vault(KEY_A);
    const secret = 'توكن سرّي 🔐 ' + 'x'.repeat(5000);
    expect(v.decrypt(v.encrypt(secret))).toBe(secret);
  });

  it('round-trips a JSON credential object', () => {
    const v = vault(KEY_A);
    const creds = { accessToken: 'at_123', refreshToken: 'rt_456', expiresIn: 3600 };
    const token = v.encryptJson(creds);
    expect(v.decryptJson(token)).toEqual(creds);
  });

  it('produces different ciphertext each time for the same input', () => {
    // A fresh IV per call — otherwise identical secrets would be linkable on disk.
    const v = vault(KEY_A);
    expect(v.encrypt('same')).not.toBe(v.encrypt('same'));
  });

  it('emits the versioned, self-describing token shape', () => {
    const parts = vault(KEY_A).encrypt('x').split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
  });
});

describe('CredentialVault — tamper and key integrity', () => {
  it('fails to decrypt when the ciphertext byte is flipped', () => {
    const v = vault(KEY_A);
    const token = v.encrypt('secret');
    const parts = token.split(':');
    const ct = Buffer.from(parts[3], 'base64');
    ct[0] ^= 0x01; // flip one bit
    parts[3] = ct.toString('base64');
    expect(() => v.decrypt(parts.join(':'))).toThrow();
  });

  it('fails to decrypt when the auth tag is altered', () => {
    const v = vault(KEY_A);
    const parts = v.encrypt('secret').split(':');
    const tag = Buffer.from(parts[2], 'base64');
    tag[0] ^= 0xff;
    parts[2] = tag.toString('base64');
    expect(() => v.decrypt(parts.join(':'))).toThrow();
  });

  it('cannot be decrypted with a different key', () => {
    const token = vault(KEY_A).encrypt('secret');
    expect(() => vault(KEY_B).decrypt(token)).toThrow();
  });

  it('rejects a malformed token instead of returning garbage', () => {
    const v = vault(KEY_A);
    expect(() => v.decrypt('garbage')).toThrow('Malformed ciphertext');
    expect(() => v.decrypt('v2:a:b:c')).toThrow('Malformed ciphertext');
    expect(() => v.decrypt('v1:only:three')).toThrow('Malformed ciphertext');
  });
});

describe('CredentialVault — AAD binding', () => {
  it('round-trips when the same context is supplied', () => {
    const v = vault(KEY_A);
    const aad = 'org_acme:slack';
    expect(v.decrypt(v.encrypt('secret', aad), aad)).toBe('secret');
  });

  it('refuses to decrypt a ciphertext under a different context', () => {
    // A credential row copied from org_acme into org_globex will not decrypt
    // under the thief's context — this is defence in depth for tenant isolation.
    const v = vault(KEY_A);
    const token = v.encrypt('secret', 'org_acme:slack');
    expect(() => v.decrypt(token, 'org_globex:slack')).toThrow();
  });

  it('refuses to decrypt bound ciphertext with no context, and vice versa', () => {
    const v = vault(KEY_A);
    expect(() => v.decrypt(v.encrypt('s', 'ctx'))).toThrow();
    expect(() => v.decrypt(v.encrypt('s'), 'ctx')).toThrow();
  });
});

describe('CredentialVault.safeEqual', () => {
  it('matches equal strings and rejects unequal ones', () => {
    expect(CredentialVault.safeEqual('abc123', 'abc123')).toBe(true);
    expect(CredentialVault.safeEqual('abc123', 'abc124')).toBe(false);
  });

  it('rejects strings of different lengths without throwing', () => {
    expect(CredentialVault.safeEqual('short', 'longer-value')).toBe(false);
  });
});
