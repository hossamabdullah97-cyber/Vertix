jest.mock('web-push', () => ({ __esModule: true, default: { sendNotification: jest.fn() } }));
import webpush from 'web-push';
import { PushService, pushPayload } from './push.service';

const send = webpush.sendNotification as unknown as jest.Mock;

function make(
  keys = true,
  subs = [{ id: 's1', endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a', lang: 'ar' }],
  phones: { id: string; token: string; lang: string }[] = [],
) {
  const db = {
    appPushToken: {
      findMany: jest.fn().mockResolvedValue(phones),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(phones.length),
    },
    pushSubscription: {
      findMany: jest.fn().mockResolvedValue(subs),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(subs.length),
    },
  };
  const env: Record<string, string> = keys ? { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', APP_PUBLIC_URL: 'https://app.example' } : {};
  const service = new PushService({ client: db } as never, { get: (k: string) => env[k] } as never);
  return { service, db };
}

beforeEach(() => send.mockReset());

describe('pushPayload', () => {
  it('writes a new lead in the device language, opening that lead', () => {
    const n = { type: 'lead.captured', title: 'New lead captured', body: 'Mona Adel · Acme', metadata: { leadId: 'L1', intent: 'MEETING' } };
    expect(pushPayload(n, 'ar')).toEqual({ title: 'طلب اجتماع جديد', body: 'Mona Adel · Acme', url: '/leads?lead=L1', tag: 'lead-L1' });
    expect(pushPayload(n, 'en').title).toBe('New meeting request');
    expect(pushPayload({ ...n, metadata: { leadId: 'L2', intent: 'CONTACT' } }, 'en').title).toBe('New lead');
  });

  it('opens in the workspace it came from, whichever is open on the phone', () => {
    const p = pushPayload({ type: 'lead.captured', title: 'New lead', body: 'Laila', metadata: { leadId: 'l1' }, orgId: 'org_nile' }, 'en');
    expect(p.url).toBe('/leads?lead=l1&w=org_nile');
  });

  it('asks an invitee in their language, opening their invitations', () => {
    const p = pushPayload({ type: 'member.invited', title: "You're invited to join Nile Co", body: 'Mona', metadata: { orgId: 'org_nile', orgName: 'Nile Co' }, orgId: null }, 'ar');
    expect(p).toMatchObject({ title: 'دعوة للانضمام إلى Nile Co', body: 'Mona', url: '/invitations' });
  });

  it('keeps the title of kinds it has no words for', () => {
    expect(pushPayload({ type: 'member.added', title: 'Sara joined', body: 'x' }, 'ar', 'n9')).toEqual({ title: 'Sara joined', body: 'x', url: '/team', tag: 'n-n9' });
  });
});

describe('PushService', () => {
  it('is off without VAPID keys, and sends nothing', async () => {
    const { service, db } = make(false);
    expect(service.publicKey).toBeNull();
    await expect(service.send('u1', { type: 'lead.captured', title: 't' })).resolves.toBe(0);
    expect(db.pushSubscription.findMany).not.toHaveBeenCalled();
  });

  it("sends to each of the user's devices, in each device's language", async () => {
    const { service, db } = make();
    send.mockResolvedValue({ statusCode: 201 });
    await expect(service.send('u1', { type: 'lead.captured', title: 't', body: 'Mona', metadata: { leadId: 'L1' }, priority: 'HIGH' })).resolves.toBe(1);
    const [sub, body, opts] = send.mock.calls[0];
    expect(sub).toEqual({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } });
    expect(JSON.parse(body)).toMatchObject({ title: 'عميل جديد', url: '/leads?lead=L1' });
    expect(opts).toMatchObject({ urgency: 'high', vapidDetails: { publicKey: 'pub', privateKey: 'priv', subject: 'https://app.example' } });
    expect(db.pushSubscription.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { lastUsedAt: expect.any(Date) } });
  });

  it('forgets a device the push service no longer knows', async () => {
    const { service, db } = make();
    send.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
    await expect(service.send('u1', { type: 'x', title: 't' })).resolves.toBe(0);
    expect(db.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('keeps a device after a passing failure', async () => {
    const { service, db } = make();
    send.mockRejectedValue(Object.assign(new Error('busy'), { statusCode: 503 }));
    await service.send('u1', { type: 'x', title: 't' });
    expect(db.pushSubscription.delete).not.toHaveBeenCalled();
  });

  it("removes only the caller's own device", async () => {
    const { service, db } = make();
    await service.unsubscribe('u1', 'https://push.example/abc');
    expect(db.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', endpoint: 'https://push.example/abc' } });
  });
});

describe('PushService on phones with the app', () => {
  const phones = [
    { id: 'p1', token: 'ExponentPushToken[aaa]', lang: 'ar' },
    { id: 'p2', token: 'ExponentPushToken[bbb]', lang: 'en' },
  ];
  let fetchMock: jest.SpyInstance;
  const reply = (data: unknown[]) => fetchMock.mockResolvedValue(new Response(JSON.stringify({ data }), { status: 200 }));
  beforeEach(() => (fetchMock = jest.spyOn(globalThis, 'fetch')));
  afterEach(() => fetchMock.mockRestore());

  it('sends through Expo even without VAPID keys, each phone in its language, with where a tap goes', async () => {
    const { service, db } = make(false, [], phones);
    reply([{ status: 'ok', id: 't1' }, { status: 'ok', id: 't2' }]);
    await expect(
      service.send('u1', { type: 'lead.captured', title: 't', body: 'Mona', metadata: { leadId: 'L1' }, priority: 'HIGH', orgId: 'org1' }, 'n1'),
    ).resolves.toBe(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    const sent = JSON.parse(init.body);
    expect(sent[0]).toMatchObject({ to: 'ExponentPushToken[aaa]', title: 'عميل جديد', body: 'Mona', priority: 'high', data: { leadId: 'L1', orgId: 'org1', notificationId: 'n1' } });
    expect(sent[0].data.url).toContain('/leads?lead=L1');
    expect(sent[1]).toMatchObject({ to: 'ExponentPushToken[bbb]', title: 'New lead' });
    expect(init.headers).not.toHaveProperty('authorization');
    expect(db.appPushToken.update).toHaveBeenCalledTimes(2);
  });

  it('forgets a phone the app was removed from, and keeps the others', async () => {
    const { service, db } = make(false, [], phones);
    reply([{ status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }, { status: 'error', message: 'slow', details: { error: 'MessageRateExceeded' } }]);
    await expect(service.send('u1', { type: 'x', title: 't' })).resolves.toBe(0);
    expect(db.appPushToken.delete).toHaveBeenCalledTimes(1);
    expect(db.appPushToken.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });

  it('never throws when Expo is unreachable', async () => {
    const { service } = make(false, [], phones);
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(service.send('u1', { type: 'x', title: 't' })).resolves.toBe(0);
  });

  it('asks nothing of Expo for someone without the app', async () => {
    const { service } = make(false, [], []);
    await service.send('u1', { type: 'x', title: 't' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('registers a phone for whoever signs in on it, and forgets only their own', async () => {
    const { service, db } = make(false, [], phones);
    await service.registerApp('u2', { token: 'ExponentPushToken[aaa]', platform: 'ios', lang: 'ar' });
    expect(db.appPushToken.upsert).toHaveBeenCalledWith({
      where: { token: 'ExponentPushToken[aaa]' },
      create: { userId: 'u2', token: 'ExponentPushToken[aaa]', platform: 'ios', lang: 'ar' },
      update: { userId: 'u2', platform: 'ios', lang: 'ar' },
    });
    await service.unregisterApp('u2', 'ExponentPushToken[aaa]');
    expect(db.appPushToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u2', token: 'ExponentPushToken[aaa]' } });
  });
});
