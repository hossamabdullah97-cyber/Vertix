/**
 * Express's "trust proxy" setting, from TRUST_PROXY. It decides which address
 * the API sees as the caller, and so what the sign-in limits count per
 * address. Behind a load balancer it must be set, or every visitor shares the
 * balancer's address; left unset when the API is reached directly, as in
 * docker-compose.prod.yml.
 *
 *   unset / ""      the connecting address (Express's default)
 *   "1", "2", …     that many proxies in front of the API
 *   "10.0.0.0/8, loopback"   the proxies' addresses or subnets
 *
 * "true" is refused: it trusts whatever X-Forwarded-For a client sends, so
 * anyone could claim a fresh address on every request and step around the
 * limits.
 */
export function trustProxySetting(raw: string | undefined): number | string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  if (/^(true|false)$/i.test(value)) {
    throw new Error('TRUST_PROXY: give the number of proxies (e.g. 1) or their addresses, not true/false');
  }
  return value;
}
