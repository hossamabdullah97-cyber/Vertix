import { ErrorsService, MAX_GROUPS, cleanPath, fingerprint, isNoise, normalizeMessage, topFrame } from './errors.service';

function setup(known: { id: string; resolvedAt: Date | null; userIds: string[] } | null = null, groups = 0, env: Record<string, string> = {}) {
  const db = {
    errorGroup: {
      findUnique: jest.fn(async () => known),
      update: jest.fn(async () => ({})),
      create: jest.fn(async () => ({})),
      count: jest.fn(async () => groups),
      deleteMany: jest.fn(async () => ({ count: 3 })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async () => []),
    },
  };
  const mail = { send: jest.fn(async () => true) };
  const config = { get: (k: string) => ({ APP_PUBLIC_URL: 'https://app.test', ...env })[k] };
  const service = new ErrorsService({ client: db } as never, config as never, mail as never);
  return { service, db, mail };
}

const chromeStack = (file: string, line: number) =>
  `TypeError: Cannot read properties of undefined (reading 'name')\n    at LeadCard (https://app.vertex.test/_next/static/chunks/app/leads/page-${file}.js:1:${line})\n    at renderWithHooks (https://app.vertex.test/_next/static/chunks/framework.js:1:999)`;

describe('grouping errors', () => {
  it('takes out what changes between occurrences', () => {
    expect(normalizeMessage('Card cm1abc2def3ghi4jkl5mno6pqr not found for 42 people')).toBe('Card <id> not found for <n> people');
    expect(normalizeMessage("Cannot read properties of undefined (reading 'name')")).toBe('Cannot read properties of undefined (reading <value>)');
    expect(normalizeMessage('GET https://api.test/x?y=1 failed')).toBe('GET <url> failed');
  });

  it('finds the same place in the next build, whatever its file hash and line', () => {
    expect(topFrame(chromeStack('3f2a1b9c0d', 1200))).toBe(topFrame(chromeStack('99aa88bb77', 1350)));
    expect(topFrame(chromeStack('3f2a1b9c0d', 1200))).toContain('LeadCard');
    expect(topFrame(undefined)).toBe('');
  });

  it('is one group for one bug, and two for two', () => {
    const a = fingerprint('BROWSER', 'TypeError', 'x 1', topFrame(chromeStack('aaaaaaaa11', 1)));
    expect(fingerprint('BROWSER', 'TypeError', 'x 2', topFrame(chromeStack('bbbbbbbb22', 9)))).toBe(a);
    expect(fingerprint('API', 'TypeError', 'x 1', topFrame(chromeStack('aaaaaaaa11', 1)))).not.toBe(a);
  });

  it('leaves out noise and anything after the path', () => {
    expect(isNoise({ name: 'Error', message: 'Script error.' })).toBe(true);
    expect(isNoise({ name: 'Error', message: 'ResizeObserver loop completed with undelivered notifications.' })).toBe(true);
    expect(isNoise({ name: 'TypeError', message: 'x', stack: 'at y (chrome-extension://abc/z.js:1:1)' })).toBe(true);
    expect(isNoise({ name: 'TypeError', message: 'x is undefined' })).toBe(false);
    expect(cleanPath('/reset-password?token=secret#x')).toBe('/reset-password');
  });
});

describe('recording an error', () => {
  const report = { kind: 'error' as const, name: 'TypeError', message: 'x is undefined', stack: chromeStack('3f2a1b9c0d', 10), path: '/leads?lead=abc', release: '2026-10-06' };

  it('makes a new group, and tells whoever runs the platform', async () => {
    const { service, db, mail } = setup(null, 0, { OPS_ALERT_EMAIL: 'ops@vertex.test' });
    await service.fromBrowser(report, { userAgent: 'UA', userId: 'u1' });
    expect(db.errorGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: 'BROWSER', kind: 'error', name: 'TypeError', path: '/leads', release: '2026-10-06', userAgent: 'UA', userIds: ['u1'] }),
    });
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'ops@vertex.test', subject: expect.stringContaining('New error: TypeError: x is undefined') }));
    // Not again within the hour.
    db.errorGroup.findUnique.mockResolvedValue({ id: 'g1', resolvedAt: new Date(), userIds: [] } as never);
    await service.fromBrowser(report, { userId: 'u2' });
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it('keeps the phone app’s errors apart from the browser’s, and says where in the alert', async () => {
    const { service, db, mail } = setup(null, 0, { OPS_ALERT_EMAIL: 'ops@vertex.test' });
    await service.fromBrowser({ ...report, platform: 'ios', path: '/lead/[id]' }, { userAgent: 'VertexConnectApp/1.0 (iPhone; iOS 19.0; Mobile)' });
    expect(db.errorGroup.create).toHaveBeenCalledWith({ data: expect.objectContaining({ source: 'APP', path: '/lead/[id]' }) });
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining('[Vertex phone app]') }));
    expect(fingerprint('APP', 'TypeError', 'x', 'f')).not.toBe(fingerprint('BROWSER', 'TypeError', 'x', 'f'));
  });

  it('counts a known one, and the people it reached', async () => {
    const { service, db, mail } = setup({ id: 'g1', resolvedAt: null, userIds: ['u1'] });
    await service.fromBrowser(report, { userId: 'u2' });
    expect(db.errorGroup.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: expect.objectContaining({ count: { increment: 1 }, resolvedAt: null, userIds: ['u1', 'u2'] }),
    });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('reopens one marked fixed that happens again', async () => {
    const { service, db, mail } = setup({ id: 'g1', resolvedAt: new Date(), userIds: [] }, 0, { OPS_ALERT_EMAIL: 'ops@vertex.test' });
    await service.fromServer(new Error('db down'), 'GET /api/leads');
    expect(db.errorGroup.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ resolvedAt: null }) }));
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining('[Vertex API] Error is back') }));
  });

  it('stops making groups once there are too many, and drops noise', async () => {
    const full = setup(null, MAX_GROUPS);
    await full.service.fromBrowser(report, {});
    expect(full.db.errorGroup.create).not.toHaveBeenCalled();
    const noise = setup();
    await noise.service.fromBrowser({ ...report, message: 'Script error.' }, {});
    expect(noise.db.errorGroup.findUnique).not.toHaveBeenCalled();
  });

  it('never fails the request a server error came from', async () => {
    const { service, db } = setup();
    db.errorGroup.findUnique.mockRejectedValue(new Error('db gone'));
    await expect(service.fromServer(new Error('boom'), 'GET /api/x')).resolves.toBeUndefined();
  });
});
