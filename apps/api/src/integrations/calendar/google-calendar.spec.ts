import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { CredentialVault } from '../credential-vault.service';
import { OAuthService, safeReturnPath } from '../oauth.service';
import { signState } from '../oauth-state';
import { GoogleCalendarService } from './google-calendar.service';
import { openSlots, DEFAULT_AVAILABILITY } from '../../cards/availability';

const SECRET = 'calendar_test_secret_16chars_min';

/** Google, as small as these tests need: the token endpoint and the Calendar API. */
class FakeGoogle {
  server!: Server;
  url = '';
  calls: { method: string; path: string; auth: string | undefined; body: unknown }[] = [];
  busy: { start: string; end: string }[] = [];
  /** Answers the next Calendar call with this status. */
  failNext: number | null = null;

  async start() {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const json = (status: number, body: unknown) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(body === undefined ? '' : JSON.stringify(body));
        };
        if (req.url === '/token') {
          const f = new URLSearchParams(raw);
          const idToken = `x.${Buffer.from(JSON.stringify({ email: 'omar@gmail.com' })).toString('base64url')}.y`;
          if (f.get('grant_type') === 'authorization_code') return json(200, { access_token: 'g-access-1', refresh_token: 'g-refresh', expires_in: 3600, id_token: idToken });
          return json(200, { access_token: 'g-access-2', expires_in: 3600 });
        }
        const body = raw ? JSON.parse(raw) : undefined;
        this.calls.push({ method: req.method!, path: req.url!, auth: req.headers.authorization, body });
        if (this.failNext) {
          const s = this.failNext;
          this.failNext = null;
          return json(s, { error: { message: 'nope' } });
        }
        if (req.url === '/freeBusy') return json(200, { calendars: { primary: { busy: this.busy } } });
        if (req.url === '/calendars/primary/events' && req.method === 'POST') return json(200, { id: 'evt-1', htmlLink: 'https://calendar.google.com/event?eid=1' });
        if (req.url?.startsWith('/calendars/primary/events/') && req.method === 'PATCH') return json(200, { id: 'evt-1' });
        if (req.url?.startsWith('/calendars/primary/events/') && req.method === 'DELETE') return json(204, undefined);
        json(404, { error: 'not found' });
      });
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
}

describe('Google Calendar, connected by each person for themselves', () => {
  const google = new FakeGoogle();
  let rows: Record<string, unknown>[];
  let oauth: OAuthService;
  let calendar: GoogleCalendarService;

  beforeAll(() => google.start());
  afterAll(() => google.server.close());

  beforeEach(() => {
    rows = [];
    google.calls = [];
    google.busy = [];
    const env: Record<string, string> = {
      JWT_SECRET: SECRET,
      INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      OAUTH_GOOGLE_CALENDAR_CLIENT_ID: 'cid',
      OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET: 'csecret',
      OAUTH_GOOGLE_CALENDAR_TOKEN_URL: `${google.url}/token`,
      GOOGLE_CALENDAR_API_URL: google.url,
    };
    const config = { get: (k: string) => env[k], getOrThrow: (k: string) => env[k] } as never;
    const match = (where: Record<string, unknown>) => (r: Record<string, unknown>) =>
      Object.entries(where).every(([k, v]) => (k === 'status' || k === 'deletedAt' ? true : r[k] === v));
    const prisma = {
      client: {
        integrationConnection: {
          findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
            const r = rows.find(match(where));
            if (!r) return null;
            const s = where.status as { not?: string } | undefined;
            return s?.not && r.status === s.not ? null : r;
          }),
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
            const r = { id: `c${rows.length + 1}`, deletedAt: null, updatedAt: new Date(), ...data };
            rows.push(r);
            return r;
          }),
          update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(rows.find((r) => r.id === where.id)!, data)),
          updateMany: jest.fn(async () => ({ count: 1 })),
        },
      },
    } as never;
    const apps = { getCredentials: jest.fn(async () => null), configuredProviders: jest.fn(async () => new Set()) } as never;
    oauth = new OAuthService(prisma, config, new CredentialVault(config), { log: jest.fn() } as never, apps);
    calendar = new GoogleCalendarService(prisma, config, oauth, apps);
  });

  const connect = async (userId: string) => {
    const state = signState({ orgId: 'org1', userId, provider: 'google_calendar', nonce: userId, exp: Math.floor(Date.now() / 1000) + 300, returnTo: '/cards/c1' }, SECRET);
    return oauth.handleCallback('code', state);
  };

  it('asks Google for offline access, so the connection lasts', async () => {
    const { url } = await oauth.getAuthorizationUrl({ orgId: 'org1', userId: 'u1', role: 'EMPLOYEE' }, 'google_calendar', { returnTo: '/cards/c1' });
    const q = new URL(url).searchParams;
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('prompt')).toBe('consent');
    expect(q.get('scope')).toContain('https://www.googleapis.com/auth/calendar.freebusy');
  });

  it('keeps one connection per person, named by their Google address, and comes back where it started', async () => {
    await expect(connect('omar')).resolves.toMatchObject({ provider: 'google_calendar', returnTo: '/cards/c1' });
    await connect('mona');
    expect(rows.map((r) => [r.userId, r.scope, r.externalAccountName])).toEqual([
      ['omar', 'USER', 'omar@gmail.com'],
      ['mona', 'USER', 'omar@gmail.com'],
    ]);
    // One person's calendar is not another's.
    await expect(oauth.getAuth('org1', 'google_calendar', false, 'sara')).rejects.toThrow('not connected');
    await expect(oauth.getAuth('org1', 'google_calendar')).rejects.toThrow('not connected');
  });

  it('a return address is a page here, never another site', () => {
    expect(safeReturnPath('/cards/c1?w=acme')).toBe('/cards/c1?w=acme');
    expect(safeReturnPath('//evil.example.com')).toBeUndefined();
    expect(safeReturnPath('/\\evil.example.com')).toBeUndefined();
    expect(safeReturnPath('https://evil.example.com')).toBeUndefined();
  });

  it('reads when the person is busy, and nothing when they have not connected', async () => {
    expect(await calendar.busy('org1', 'omar', new Date(), new Date())).toEqual([]);
    expect(google.calls).toHaveLength(0);
    await connect('omar');
    google.busy = [{ start: '2026-09-29T06:00:00Z', end: '2026-09-29T07:00:00Z' }];
    const busy = await calendar.busy('org1', 'omar', new Date('2026-09-28T00:00:00Z'), new Date('2026-10-13T00:00:00Z'));
    expect(busy).toEqual([{ start: new Date('2026-09-29T06:00:00Z'), end: new Date('2026-09-29T07:00:00Z') }]);
    expect(google.calls[0]).toMatchObject({ method: 'POST', path: '/freeBusy', auth: 'Bearer g-access-1', body: { items: [{ id: 'primary' }] } });
    // Asked again within the minute: from memory.
    await calendar.busy('org1', 'omar', new Date(), new Date());
    expect(google.calls).toHaveLength(1);
  });

  it('a Google that fails leaves the card offering what it knows', async () => {
    await connect('omar');
    google.failNext = 500;
    expect(await calendar.busy('org1', 'omar', new Date(), new Date())).toEqual([]);
  });

  it('holds a request tentatively, then confirms it or gives the time back', async () => {
    await connect('omar');
    const held = await calendar.hold('org1', 'omar', {
      start: new Date('2026-09-29T06:00:00Z'),
      minutes: 30,
      timezone: 'Africa/Cairo',
      name: 'Laila',
      email: 'laila@example.com',
      phone: null,
      company: 'Nile Foods',
      note: 'About the offer',
      leadUrl: 'https://app.example.com/leads?lead=l1',
    });
    expect(held).toEqual({ id: 'evt-1', link: 'https://calendar.google.com/event?eid=1' });
    expect(google.calls[0]!.body).toMatchObject({
      summary: 'Meeting request: Laila (Nile Foods)',
      status: 'tentative',
      start: { dateTime: '2026-09-29T06:00:00.000Z', timeZone: 'Africa/Cairo' },
      end: { dateTime: '2026-09-29T06:30:00.000Z' },
    });
    expect(await calendar.confirm('org1', 'omar', 'evt-1', 'Laila')).toBe(true);
    expect(google.calls[1]).toMatchObject({ method: 'PATCH', path: '/calendars/primary/events/evt-1', body: { status: 'confirmed', summary: 'Meeting with Laila' } });
    expect(await calendar.cancel('org1', 'omar', 'evt-1')).toBe(true);
    expect(google.calls[2]).toMatchObject({ method: 'DELETE' });
  });

  it('renews the token once when Google says it is stale', async () => {
    await connect('omar');
    google.failNext = 401;
    await calendar.busy('org1', 'omar', new Date(), new Date());
    expect(google.calls.map((c) => c.auth)).toEqual(['Bearer g-access-1', 'Bearer g-access-2']);
  });

  it('nothing is held for someone who has not connected', async () => {
    expect(await calendar.hold('org1', 'nobody', { start: new Date(), minutes: 30, timezone: 'UTC', name: 'x', leadUrl: 'u' })).toBeNull();
    expect(google.calls).toHaveLength(0);
  });
});

describe('the card’s times and the owner’s calendar', () => {
  const a = { ...DEFAULT_AVAILABILITY, timezone: 'Africa/Cairo', days: [2], start: '09:00', end: '11:00', length: 30, notice: 2 };
  const now = new Date('2026-09-28T07:00:00Z');
  it('leaves out every time that overlaps a busy stretch', () => {
    // Busy 09:15–10:00 Cairo on Tuesday: 09:00 and 09:30 overlap it.
    const busy = [{ start: new Date('2026-09-29T06:15:00Z'), end: new Date('2026-09-29T07:00:00Z') }];
    expect(openSlots(a, now, [], 14, busy)[0]!.slots.map((s) => s.time)).toEqual(['10:00', '10:30']);
  });
});
