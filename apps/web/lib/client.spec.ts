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

/** A fetch Response as authFetch reads it: status, ok and a text body. */
function reply(status: number, body: unknown = null) {
  const text = body === null ? '' : JSON.stringify(body);
  return { status, ok: status >= 200 && status < 300, text: async () => text, json: async () => body } as Response;
}

function signedIn(access = 'old.tok') {
  localStorage.setItem('vertex_token', access);
  localStorage.setItem('vertex_refresh', 'refresh.tok');
}

function at(pathname: string, search = '') {
  (globalThis as unknown as { location: Record<string, string> }).location = { pathname, search, href: '' };
  return (globalThis as unknown as { location: Record<string, string> }).location;
}

describe('an expired session is renewed, not ended', () => {
  it('trades the refresh token once and repeats the request with the new one', async () => {
    const { authFetch } = await import('./client');
    signedIn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(401))
      .mockResolvedValueOnce(reply(201, { accessToken: 'new.tok', refreshToken: 'refresh.2' }))
      .mockResolvedValueOnce(reply(200, { leads: 3 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(authFetch('/leads')).resolves.toEqual({ leads: 3 });

    expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/refresh$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ refreshToken: 'refresh.tok' });
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer new.tok');
    expect(localStorage.getItem('vertex_token')).toBe('new.tok');
    expect(localStorage.getItem('vertex_refresh')).toBe('refresh.2');
  });

  it('renews once for requests that expire together', async () => {
    const { authFetch } = await import('./client');
    signedIn();
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) return reply(201, { accessToken: 'new.tok', refreshToken: 'refresh.2' });
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === 'Bearer new.tok' ? reply(200, { ok: true }) : reply(401);
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([authFetch('/a'), authFetch('/b'), authFetch('/c')]);

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('ends the session when it cannot be renewed, and comes back to the same page', async () => {
    const { authFetch } = await import('./client');
    signedIn();
    const location = at('/leads', '?stage=new');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(401)));

    await expect(authFetch('/leads')).rejects.toThrow('Unauthorized');

    expect(localStorage.getItem('vertex_token')).toBeNull();
    expect(location.href).toBe('/login?expired=1&next=%2Fleads%3Fstage%3Dnew');
  });

  it('does not call a visitor who never signed in "expired", nor try to renew', async () => {
    const { authFetch } = await import('./client');
    const location = at('/billing');
    const fetchMock = vi.fn().mockResolvedValue(reply(401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(authFetch('/billing/usage')).rejects.toThrow('Unauthorized');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(location.href).toBe('/login?next=%2Fbilling');
  });
});

describe('sign-in only returns to pages of this app', () => {
  it.each([
    ['/leads?stage=new', '/leads?stage=new'],
    ['/cards/abc', '/cards/abc'],
    ['//evil.example', null],
    ['/\\evil.example', null],
    ['https://evil.example/', null],
    ['/login?next=/leads', null],
    ['/register', null],
    ['', null],
    [null, null],
  ])('%s → %s', async (next, expected) => {
    const { safeNext } = await import('./client');
    expect(safeNext(next)).toBe(expected);
  });
});

describe('a refused sign-in says why', () => {
  it('carries the status, so the page can explain it in the right language', async () => {
    const { login, AuthError } = await import('./client');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(403, { message: 'This account has been suspended.' })));
    const err = await login('a@b.co', 'pw').catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(403);
  });

  it('tells an unreachable server apart from a wrong password', async () => {
    const { login } = await import('./client');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(login('a@b.co', 'pw')).rejects.toMatchObject({ status: 0 });
  });

  it('sends the email without the spaces a keyboard adds', async () => {
    const { login } = await import('./client');
    const fetchMock = vi.fn().mockResolvedValue(reply(201, TOKENS));
    vi.stubGlobal('fetch', fetchMock);
    await login('  omar@acme.co ', 'pw');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).email).toBe('omar@acme.co');
  });
});

describe('when a session cannot be renewed', () => {
  it('the first request to find out decides where to go, and later ones do not undo it', async () => {
    const { authFetch } = await import('./client');
    signedIn();
    const location = at('/leads');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/auth/refresh')) return reply(401);
        return reply(401);
      }),
    );

    await expect(authFetch('/a')).rejects.toThrow('Unauthorized');
    const after = location.href;
    // A request that starts once the session is already gone.
    await expect(authFetch('/b')).rejects.toThrow('Unauthorized');

    expect(after).toBe('/login?expired=1&next=%2Fleads');
    expect(location.href).toBe(after);
  });

  it('retries without renewing again when another request already renewed it', async () => {
    const { authFetch } = await import('./client');
    signedIn('old.tok');
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) throw new Error('should not renew');
      const auth = (init.headers as Record<string, string>).Authorization;
      if (auth === 'Bearer old.tok') {
        // Renewed elsewhere while this request was out.
        localStorage.setItem('vertex_token', 'new.tok');
        return reply(401);
      }
      return reply(200, { ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(authFetch('/a')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('a sign-in lockout', () => {
  it('carries how long to wait, so the page can say when to try again', async () => {
    const { login } = await import('./client');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(429, { statusCode: 429, message: 'Too many attempts. Try again in 7 minutes.', retryAfter: 420 })));
    await expect(login('a@b.co', 'pw')).rejects.toMatchObject({ status: 429, retryAfter: 420 });
  });

  it('has no wait when the API gave none', async () => {
    const { login } = await import('./client');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(429, { statusCode: 429, message: 'ThrottlerException: Too Many Requests' })));
    const err = await login('a@b.co', 'pw').catch((e) => e);
    expect(err.retryAfter).toBeUndefined();
  });
});

describe('reads in flight at once share one request', () => {
  it('asks the server once for the same page read, and again once the answer is in', async () => {
    const { authFetch } = await import('./client');
    const fetchMock = vi.fn().mockImplementation(async () => ({ ok: true, text: async () => '{"id":"u1"}' }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([authFetch('/auth/me'), authFetch('/auth/me')]);
    expect(a).toEqual({ id: 'u1' });
    expect(b).toEqual({ id: 'u1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await authFetch('/auth/me');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never shares a write', async () => {
    const { authFetch } = await import('./client');
    const fetchMock = vi.fn().mockImplementation(async () => ({ ok: true, text: async () => '{}' }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([authFetch('/x', { method: 'POST', body: '{}' }), authFetch('/x', { method: 'POST', body: '{}' })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('a page opened again starts from its last answer', () => {
  it('keeps the last read per workspace, and forgets it when that resource changes', async () => {
    const { authFetch, peek, setActiveOrgId } = await import('./client');
    let body = '[{"id":"c1"}]';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({ ok: true, text: async () => body }) as Response));

    expect(peek('/cards')).toBeUndefined();
    await authFetch('/cards');
    await authFetch('/leads');
    expect(peek('/cards')).toEqual([{ id: 'c1' }]);

    // Another workspace has its own answers.
    setActiveOrgId('org_b');
    expect(peek('/cards')).toBeUndefined();
    setActiveOrgId(null);

    body = '{}';
    await authFetch('/cards/c1', { method: 'DELETE' });
    expect(peek('/cards')).toBeUndefined();
    expect(peek('/leads')).toEqual([{ id: 'c1' }]);
  });

  it('forgets it even when the change is refused, since the server may have taken part of it', async () => {
    const { authFetch, peek } = await import('./client');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, text: async () => '[1]' } as Response).mockResolvedValueOnce({ ok: false, status: 400, text: async () => '{"message":"Invalid input"}' } as Response));
    await authFetch('/tags');
    await expect(authFetch('/tags/1', { method: 'PATCH', body: '{}' })).rejects.toThrow('Invalid input');
    expect(peek('/tags')).toBeUndefined();
  });
});

describe('a studio being open does not forget the cards', () => {
  it('keeps reads across the presence beat, which changes nothing', async () => {
    const { authFetch, peek } = await import('./client');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({ ok: true, text: async () => '[]' }) as Response));
    await authFetch('/cards');
    await authFetch('/cards/c1/presence', { method: 'PUT' });
    expect(peek('/cards')).toEqual([]);
  });
});
