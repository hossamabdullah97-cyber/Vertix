import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const TAG_BYTES = 16;
const VERSION = 'v1';

/**
 * Encrypts integration credentials (OAuth tokens, API keys) at rest with
 * AES-256-GCM. The master key comes from INTEGRATION_ENCRYPTION_KEY and never
 * leaves the server; plaintext credentials are never stored and never sent to
 * the client.
 *
 * Design choices that matter for security:
 *  - A fresh random IV per encryption, so identical secrets differ on disk.
 *  - The GCM auth tag makes tampering or a wrong key a hard decrypt failure,
 *    not silent garbage.
 *  - An optional `aad` binds a ciphertext to its context (e.g. "orgId:provider")
 *    so a stolen row cannot be replayed against a different tenant's record.
 *  - When the key is absent the vault is disabled and callers must degrade to
 *    "unavailable" — we never fall back to storing plaintext.
 */
@Injectable()
export class CredentialVault {
  private readonly logger = new Logger(CredentialVault.name);
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    const raw = config.get<string>('INTEGRATION_ENCRYPTION_KEY');
    this.key = raw ? this.parseKey(raw) : null;
    if (!this.key) {
      this.logger.warn(
        'INTEGRATION_ENCRYPTION_KEY is not set — integrations requiring stored credentials are disabled.',
      );
    }
  }

  private parseKey(raw: string): Buffer | null {
    let buf: Buffer;
    try {
      buf = Buffer.from(raw, 'base64');
    } catch {
      this.logger.error('INTEGRATION_ENCRYPTION_KEY is not valid base64.');
      return null;
    }
    if (buf.length !== 32) {
      this.logger.error(
        `INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length}). Generate one with: openssl rand -base64 32`,
      );
      return null;
    }
    return buf;
  }

  /** True when a valid key is configured and credentials can be stored. */
  get enabled(): boolean {
    return this.key !== null;
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new ServiceUnavailableException(
        'Credential storage is not configured on this server.',
      );
    }
    return this.key;
  }

  /**
   * Encrypts a UTF-8 string. Returns a self-describing token:
   * `v1:<iv>:<tag>:<ciphertext>` (each part base64). `aad` must be supplied
   * again, identically, to decrypt.
   */
  encrypt(plaintext: string, aad?: string): string {
    const key = this.requireKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, key, iv);
    if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      iv.toString('base64'),
      tag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  /**
   * Reverses {@link encrypt}. Throws if the token is malformed, was encrypted
   * with a different key, has been tampered with, or was bound to a different
   * `aad` than the one supplied.
   */
  decrypt(token: string, aad?: string): string {
    const key = this.requireKey();
    const parts = token.split(':');
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new Error('Malformed ciphertext');
    }
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ciphertext = Buffer.from(parts[3], 'base64');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error('Malformed ciphertext');
    }
    const decipher = createDecipheriv(ALGO, key, iv);
    if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    // decipher.final() throws when the tag does not verify (tamper / wrong key).
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  /**
   * Encrypts a JSON-serializable credential object (e.g. {accessToken,
   * refreshToken}). Convenience over {@link encrypt}.
   */
  encryptJson(value: unknown, aad?: string): string {
    return this.encrypt(JSON.stringify(value), aad);
  }

  /** Decrypts and parses a credential object stored with {@link encryptJson}. */
  decryptJson<T>(token: string, aad?: string): T {
    return JSON.parse(this.decrypt(token, aad)) as T;
  }

  /**
   * Constant-time equality for comparing a caller-supplied secret against a
   * stored one (used by webhook signature checks and token verification).
   */
  static safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }
}
