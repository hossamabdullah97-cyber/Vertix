import { NotFoundException } from '@nestjs/common';
import { SessionsService, SESSION_IDLE_MS } from './sessions.service';

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

function setup(rows: { userAgent: string | null }[] = []) {
  const db = {
    authSession: {
      findMany: jest.fn().mockResolvedValue(rows),
      create: jest.fn().mockResolvedValue({ id: 's_new' }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ email: 'mona@x.co', name: 'Mona' }) },
  };
  const mail = { send: jest.fn().mockResolvedValue(true) };
  const config = { get: () => 'https://app.example.com/' };
  const service = new SessionsService({ client: db } as never, config as never, mail as never);
  return { service, db, mail };
}

describe('starting a device', () => {
  it('keeps where it signed in from, for a month of not being used', async () => {
    const { service, db } = setup();
    const before = Date.now();
    await expect(service.start('u1', { ip: '1.2.3.4', userAgent: CHROME_WIN })).resolves.toBe('s_new');
    const data = db.authSession.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 'u1', ip: '1.2.3.4', userAgent: CHROME_WIN });
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + SESSION_IDLE_MS);
  });

  it('emails the owner about a browser the account has not used before', async () => {
    const { service, mail } = setup([{ userAgent: CHROME_WIN }]);
    await service.start('u1', { ip: '9.9.9.9', userAgent: SAFARI_IPHONE }, { announce: true });
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'mona@x.co', subject: 'New sign-in to your Vertex Connect account' }));
    const html = mail.send.mock.calls[0][0].html as string;
    expect(html).toContain('Safari on iPhone');
    expect(html).toContain('9.9.9.9');
    expect(html).toContain('https://app.example.com/account');
  });

  it('says nothing about a familiar browser, the very first device, or when not asked to', async () => {
    const familiar = setup([{ userAgent: CHROME_WIN }]);
    await familiar.service.start('u1', { userAgent: CHROME_WIN.replace('129', '130') }, { announce: true });
    expect(familiar.mail.send).not.toHaveBeenCalled();

    const first = setup([]);
    await first.service.start('u1', { userAgent: SAFARI_IPHONE }, { announce: true });
    expect(first.mail.send).not.toHaveBeenCalled();

    const quiet = setup([{ userAgent: CHROME_WIN }]);
    await quiet.service.start('u1', { userAgent: SAFARI_IPHONE });
    expect(quiet.mail.send).not.toHaveBeenCalled();
  });
});

describe('renewing a device', () => {
  const live = (over: Record<string, unknown> = {}) => ({
    userId: 'u1',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 1000_000),
    lastSeenAt: new Date(Date.now() - 10 * 60_000),
    ip: '1.2.3.4',
    ...over,
  });

  it('renews one that stands, and moves its last-seen time on', async () => {
    const { service, db } = setup();
    db.authSession.findUnique.mockResolvedValue(live());
    await expect(service.renew('s1', 'u1', { ip: '1.2.3.4' })).resolves.toBe(true);
    expect(db.authSession.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1' } }));
  });

  it('does not write on every renewal of a device in use', async () => {
    const { service, db } = setup();
    db.authSession.findUnique.mockResolvedValue(live({ lastSeenAt: new Date() }));
    await expect(service.renew('s1', 'u1', { ip: '1.2.3.4' })).resolves.toBe(true);
    expect(db.authSession.update).not.toHaveBeenCalled();
  });

  it('refuses one signed out, lapsed, missing, or someone else’s', async () => {
    const { service, db } = setup();
    for (const row of [live({ revokedAt: new Date() }), live({ expiresAt: new Date(Date.now() - 1) }), null, live({ userId: 'u2' })]) {
      db.authSession.findUnique.mockResolvedValue(row);
      await expect(service.renew('s1', 'u1')).resolves.toBe(false);
    }
  });
});

describe('each request', () => {
  it('is refused for a device signed out here at once, and asks the database at most every few seconds otherwise', async () => {
    const { service, db } = setup();
    db.authSession.findUnique.mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    expect(await service.isLive('s1')).toBe(true);
    expect(await service.isLive('s1')).toBe(true);
    expect(db.authSession.findUnique).toHaveBeenCalledTimes(1);

    await service.revoke('u1', 's1');
    db.authSession.findUnique.mockResolvedValue({ revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
    expect(await service.isLive('s1')).toBe(false);
  });
});

describe('signing devices out', () => {
  it('touches only the person’s own', async () => {
    const { service, db } = setup();
    await service.revoke('u1', 's1');
    expect(db.authSession.updateMany).toHaveBeenCalledWith({ where: { id: 's1', userId: 'u1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    db.authSession.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.revoke('u1', 'someone_elses')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps this device when signing out the others', async () => {
    const { service, db } = setup();
    await service.revokeAll('u1', 's_here');
    expect(db.authSession.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', revokedAt: null, id: { not: 's_here' } }, data: { revokedAt: expect.any(Date) } });
  });

  it('lists this device first', async () => {
    const { service, db } = setup();
    db.authSession.findMany.mockResolvedValue([
      { id: 'a', lastSeenAt: new Date() },
      { id: 'here', lastSeenAt: new Date(0) },
    ]);
    const list = await service.list('u1', 'here');
    expect(list.map((s) => [s.id, s.current])).toEqual([
      ['here', true],
      ['a', false],
    ]);
  });
});
