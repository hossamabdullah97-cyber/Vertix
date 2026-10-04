import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Time-based one-time passwords (RFC 6238, the scheme of Google
 * Authenticator, Microsoft Authenticator, 1Password…): SHA-1, 6 digits,
 * 30-second steps. Small enough to own rather than take a dependency for.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error('Not base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new secret: 160 random bits, as authenticator apps expect. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function stepAt(now: number): number {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

/** The code for one time step. */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0xf;
  const bin = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * The time step a code belongs to, if it is right now or one step either
 * side (a phone clock a little off), and later than `after`: a code already
 * used is refused even while it is still current.
 */
export function verifyTotp(secret: string, code: string, now = Date.now(), after?: number | null): number | null {
  const digits = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(digits)) return null;
  const current = stepAt(now);
  for (const step of [current - 1, current, current + 1]) {
    if (after !== null && after !== undefined && step <= after) continue;
    const expected = totpCode(secret, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(digits))) return step;
  }
  return null;
}

/** What an authenticator app scans (the QR code shows this). */
export function otpauthUrl(secret: string, account: string, issuer = 'Vertex Connect'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

/** Ten one-time recovery codes, like "k7f2-9xqa", and the hashes kept of them. */
export function newRecoveryCodes(count = 10): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(5)).toLowerCase().slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex');
}
