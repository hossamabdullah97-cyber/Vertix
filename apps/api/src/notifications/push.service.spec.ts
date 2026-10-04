jest.mock('web-push', () => ({ __esModule: true, default: { sendNotification: jest.fn() } }));
import webpush from 'web-push';
import { PushService, pushPayload } from './push.service';

const send = webpush.sendNotification as unknown as jest.Mock;

function make(keys = true, subs = [{ id: 's1', endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a', lang: 'ar' }]) {
  const db = {
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
