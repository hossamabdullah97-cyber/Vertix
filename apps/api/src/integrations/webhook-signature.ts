import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-SHA256 signing for outbound webhooks, in the Stripe style. Every delivery
 * carries a signature header the receiver can verify with the shared secret, so
 * an endpoint can trust that a payload really came from us and was not replayed
 * or tampered with. We never send an unsigned webhook.
 *
 * Header value:  `t=<unixSeconds>,v1=<hex hmac>`
 * Signed string: `<t>.<rawBody>`
 */

export const SIGNATURE_HEADER = 'x-vertex-signature';
const SCHEME = 'v1';

/** Builds the signature header value for a raw body at a given time. */
export function signWebhook(
  rawBody: string,
  secret: string,
  timestampSeconds: number,
): string {
  const signature = createHmac('sha256', secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest('hex');
  return `t=${timestampSeconds},${SCHEME}=${signature}`;
}

/**
 * Verifies a signature header against the raw body and secret. Returns false
 * (never throws) on any mismatch, malformed header, or a timestamp outside the
 * tolerance window — the latter blocks replay of an old, captured payload.
 */
export function verifyWebhook(
  rawBody: string,
  secret: string,
  header: string | undefined,
  opts: { toleranceSeconds?: number; now?: number } = {},
): boolean {
  if (!header) return false;
  const tolerance = opts.toleranceSeconds ?? 300;
  const now = opts.now ?? Math.floor(Date.now() / 1000);

  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const idx = kv.indexOf('=');
      return idx === -1 ? [kv, ''] : [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const provided = parts[SCHEME];
  if (!Number.isFinite(t) || !provided) return false;
  if (Math.abs(now - t) > tolerance) return false;

  const expected = createHmac('sha256', secret)
    .update(`${t}.${rawBody}`)
    .digest('hex');

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
