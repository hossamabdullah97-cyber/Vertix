import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The session boundary. `vertex_org_id` is the client's memory of which
 * organization is active; it must never survive into a different account's
 * session, or that account inherits a membership check it can't pass —
 * TenantGuard then rejects it with "You do not have access to this
 * organization" even though its own token is perfectly valid.
 */

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage =
    new MemoryStorage();
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { document: { cookie: string } }).document = {
    cookie: '',
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

const TOKENS = { accessToken: 'access.tok', refreshToken: 'refresh.tok' };

describe('a fresh sign-in never inherits a stale organization selection', () => {
  it('login() clears whatever org a previous session left behind', async () => {
    const { login, setActiveOrgId, getActiveOrgId } = await import('./client');
    setActiveOrgId('org_from_a_previous_account');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(TOKENS)));

    await login('a@b.co', 'pw');

    expect(getActiveOrgId()).toBeNull();
  });

  it('register() clears whatever org a previous session left behind', async () => {
    const { register, setActiveOrgId, getActiveOrgId } = await import('./client');
    setActiveOrgId('org_from_a_previous_account');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(TOKENS)));

    await register({ email: 'a@b.co', password: 'pw', organizationName: 'Acme' });

    expect(getActiveOrgId()).toBeNull();
  });

  it('acceptInvite() clears whatever org a previous session left behind', async () => {
    const { acceptInvite, setActiveOrgId, getActiveOrgId } = await import('./client');
    setActiveOrgId('org_from_a_previous_account');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(TOKENS)));

    await acceptInvite('tok', 'pw');

    expect(getActiveOrgId()).toBeNull();
  });

  it('logout() clears it too, so the next account on this browser starts clean', async () => {
    const { logout, setActiveOrgId, getActiveOrgId } = await import('./client');
    setActiveOrgId('org_from_a_previous_account');

    logout();

    expect(getActiveOrgId()).toBeNull();
  });

  it('a cleared org id means authFetch sends no x-organization-id header', async () => {
    const { login, authFetch } = await import('./client');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(TOKENS));
    vi.stubGlobal('fetch', fetchMock);
    await login('a@b.co', 'pw');

    fetchMock.mockResolvedValue({ ok: true, text: async () => '{}' } as Response);
    await authFetch('/auth/me');

    const headers = fetchMock.mock.calls[1][1].headers as Record<string, string>;
    expect(headers).not.toHaveProperty('x-organization-id');
  });
});

describe('switching organizations still works once signed in', () => {
  it('setActiveOrgId is honored by authFetch as the x-organization-id header', async () => {
    const { setActiveOrgId, authFetch } = await import('./client');
    setActiveOrgId('org_the_user_deliberately_selected');
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => '{}' } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await authFetch('/orgs/current');

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['x-organization-id']).toBe('org_the_user_deliberately_selected');
  });
});
