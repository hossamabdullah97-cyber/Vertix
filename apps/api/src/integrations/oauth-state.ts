import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The OAuth `state` parameter: a signed, expiring token that ties a callback
 * back to the org/user/provider that started the flow. It is the CSRF defence —
 * the provider echoes it to our callback, and we reject anything we did not
 * sign or that has expired. Stateless (HMAC-signed) so it needs no storage.
 */
export interface StatePayload {
  orgId: string;
  userId: string;
  provider: string;
  /** Random nonce so two flows never collide. */
  nonce: string;
  /** Unix seconds expiry. */
  exp: number;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** Signs a state payload → `<base64url(json)>.<base64url(hmac)>`. */
export function signState(payload: StatePayload, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = b64url(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

/**
 * Verifies and decodes a state token. Returns null on any tampering, a bad
 * signature, a malformed token, or expiry — never throws.
 */
export function verifyState(token: string, secret: string, now = Math.floor(Date.now() / 1000)): StatePayload | null {
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = b64url(createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: StatePayload;
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.orgId || !payload.provider || typeof payload.exp !== 'number') return null;
  if (payload.exp <= now) return null;
  return payload;
}
