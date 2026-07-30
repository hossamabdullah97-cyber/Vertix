import { createHash, randomBytes } from 'node:crypto';

/**
 * Generation and hashing for API keys and personal access tokens. Only the
 * SHA-256 hash of a key is ever stored; the raw value is shown once at creation
 * and never again. A short, non-secret prefix is kept alongside so a key can be
 * identified in listings without revealing it.
 */

export type CredentialKind = 'api_key' | 'pat';

const PREFIXES: Record<CredentialKind, string> = {
  api_key: 'vxk_live_',
  pat: 'vxp_',
};

export interface GeneratedKey {
  /** The full secret — returned to the caller exactly once. */
  raw: string;
  /** SHA-256 hex of `raw` — what goes in the database. */
  hashed: string;
  /** Non-secret leading slice, safe to display (e.g. "vxk_live_1a2b"). */
  prefix: string;
}

/** Creates a fresh key of the given kind. */
export function generateKey(kind: CredentialKind): GeneratedKey {
  const raw = PREFIXES[kind] + randomBytes(24).toString('hex');
  return {
    raw,
    hashed: hashKey(raw),
    prefix: raw.slice(0, PREFIXES[kind].length + 4),
  };
}

/** Hashes a presented key for storage or lookup. */
export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Classifies a presented token by its prefix, or null if it is neither. */
export function classifyKey(raw: string): CredentialKind | null {
  if (raw.startsWith(PREFIXES.api_key)) return 'api_key';
  if (raw.startsWith(PREFIXES.pat)) return 'pat';
  return null;
}
