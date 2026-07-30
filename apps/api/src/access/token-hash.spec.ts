import { generateKey, hashKey, classifyKey } from './token-hash';
import { hasScope, hasAllScopes, isValidScope } from './scopes';

/**
 * Keys are the credential that lets a machine act on a workspace. These pin the
 * two properties that matter: the raw key is never derivable from what we store,
 * and scope checks fail closed.
 */

describe('token-hash', () => {
  it('mints an api key with the right prefix and a matching hash', () => {
    const k = generateKey('api_key');
    expect(k.raw.startsWith('vxk_live_')).toBe(true);
    expect(k.hashed).toBe(hashKey(k.raw));
    expect(k.hashed).toMatch(/^[a-f0-9]{64}$/);
  });

  it('mints a personal access token with its own prefix', () => {
    const k = generateKey('pat');
    expect(k.raw.startsWith('vxp_')).toBe(true);
    expect(classifyKey(k.raw)).toBe('pat');
  });

  it('stores only a hash — the raw key cannot be recovered from it', () => {
    const k = generateKey('api_key');
    expect(k.hashed).not.toContain(k.raw);
    expect(k.raw).not.toContain(k.hashed);
  });

  it('exposes only a short, non-secret prefix for display', () => {
    const k = generateKey('api_key');
    expect(k.prefix.length).toBeLessThan(k.raw.length);
    expect(k.raw.startsWith(k.prefix)).toBe(true);
  });

  it('produces a unique key each time', () => {
    expect(generateKey('api_key').raw).not.toBe(generateKey('api_key').raw);
  });

  it('classifies unknown tokens as null', () => {
    expect(classifyKey('Bearer eyJ...')).toBeNull();
    expect(classifyKey('random')).toBeNull();
  });
});

describe('scopes', () => {
  it('grants an exact scope', () => {
    expect(hasScope(['crm:read'], 'crm:read')).toBe(true);
  });

  it('denies a scope that was not granted', () => {
    expect(hasScope(['crm:read'], 'crm:write')).toBe(false);
    expect(hasScope([], 'cards:read')).toBe(false);
  });

  it('honours a resource wildcard', () => {
    expect(hasScope(['crm:*'], 'crm:write')).toBe(true);
    expect(hasScope(['crm:*'], 'cards:write')).toBe(false);
  });

  it('honours a global wildcard', () => {
    expect(hasScope(['*'], 'anything:here')).toBe(true);
  });

  it('requires every scope in an all-check', () => {
    expect(hasAllScopes(['crm:read', 'crm:write'], ['crm:read', 'crm:write'])).toBe(true);
    expect(hasAllScopes(['crm:read'], ['crm:read', 'crm:write'])).toBe(false);
  });

  it('validates scope names', () => {
    expect(isValidScope('crm:read')).toBe(true);
    expect(isValidScope('crm:delete')).toBe(false);
  });
});
