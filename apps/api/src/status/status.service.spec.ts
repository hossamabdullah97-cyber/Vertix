import { StatusService, dayOf, incidentEffect, worst } from './status.service';

const NOW = new Date('2026-10-06T12:00:00Z');

function setup(opts: { fail?: boolean; overdue?: number; mail?: { sent: number; failed: number }; latest?: object[]; days?: object[]; open?: object[] } = {}) {
  const db = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      if (opts.fail) throw new Error('connection refused');
      return strings.join('').includes('webhook_deliveries') ? [{ n: BigInt(opts.overdue ?? 0) }] : [{ '?column?': 1 }];
    }),
    statusComponent: { upsert: jest.fn(async () => ({})), findMany: jest.fn(async () => opts.latest ?? []) },
    statusDay: { upsert: jest.fn(async () => ({})), findMany: jest.fn(async () => opts.days ?? []) },
    statusIncident: {
      findMany: jest.fn(async ({ where }: { where: { status: unknown } }) => (typeof where.status === 'object' ? opts.open ?? [] : [])),
    },
  };
  const mail = { recentOutcomes: jest.fn(() => opts.mail ?? { sent: 0, failed: 0 }) };
  return { service: new StatusService({ client: db } as never, mail as never), db };
}

describe('status checks', () => {
  it('finds everything working, and keeps it per part and day', async () => {
    const { service, db } = setup();
    const checks = await service.runChecks(NOW);
    expect(checks.map((c) => [c.id, c.status])).toEqual([
      ['app', 'OPERATIONAL'],
      ['cards', 'OPERATIONAL'],
      ['email', 'OPERATIONAL'],
      ['webhooks', 'OPERATIONAL'],
    ]);
    expect(db.statusDay.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { component_day: { component: 'app', day: '2026-10-06' } }, create: { component: 'app', day: '2026-10-06', checks: 1, degraded: 0, down: 0 } }),
    );
  });

  it('marks a part down when its database query fails, with why', async () => {
    const { service } = setup({ fail: true });
    const app = (await service.check(NOW)).find((c) => c.id === 'app')!;
    expect(app).toMatchObject({ status: 'OUTAGE', detail: 'connection refused' });
  });

  it('reads email from how sends went, and webhooks from what is overdue', async () => {
    expect((await setup({ mail: { sent: 4, failed: 3 } }).service.check(NOW)).find((c) => c.id === 'email')!.status).toBe('DEGRADED');
    expect((await setup({ mail: { sent: 6, failed: 6 } }).service.check(NOW)).find((c) => c.id === 'email')!.status).toBe('OUTAGE');
    expect((await setup({ mail: { sent: 10, failed: 1 } }).service.check(NOW)).find((c) => c.id === 'email')!.status).toBe('OPERATIONAL');
    expect((await setup({ overdue: 3 }).service.check(NOW)).find((c) => c.id === 'webhooks')).toMatchObject({ status: 'DEGRADED', detail: '3 deliveries overdue' });
  });
});

describe('incidents on the page', () => {
  const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

  it('count while unresolved; maintenance only inside its window', () => {
    expect(incidentEffect({ impact: 'MAJOR', status: 'INVESTIGATING', startsAt: null, endsAt: null }, NOW)).toBe('OUTAGE');
    expect(incidentEffect({ impact: 'MINOR', status: 'MONITORING', startsAt: null, endsAt: null }, NOW)).toBe('DEGRADED');
    expect(incidentEffect({ impact: 'MAJOR', status: 'RESOLVED', startsAt: null, endsAt: null }, NOW)).toBeNull();
    expect(incidentEffect({ impact: 'MAINTENANCE', status: 'SCHEDULED', startsAt: at(2), endsAt: at(3) }, NOW)).toBeNull();
    expect(incidentEffect({ impact: 'MAINTENANCE', status: 'SCHEDULED', startsAt: at(-1), endsAt: at(1) }, NOW)).toBe('MAINTENANCE');
    expect(worst('MAINTENANCE', 'DEGRADED')).toBe('DEGRADED');
  });

  it('lays an incident over the checks, and counts 90 days of uptime', async () => {
    const { service } = setup({
      latest: [{ id: 'email', status: 'OPERATIONAL', checkedAt: NOW }],
      days: [
        { component: 'email', day: dayOf(NOW), checks: 100, degraded: 0, down: 10 },
        { component: 'email', day: dayOf(new Date(NOW.getTime() - 86_400_000)), checks: 100, degraded: 5, down: 0 },
      ],
      open: [{ id: 'i1', title: 'Emails delayed', titleAr: null, impact: 'MINOR', status: 'IDENTIFIED', components: ['email'], startsAt: null, endsAt: null, resolvedAt: null, createdAt: NOW, updates: [] }],
    });
    const v = await service.view(NOW);
    const email = v.components.find((c) => c.id === 'email')!;
    expect(email.state).toBe('DEGRADED');
    expect(email.uptime).toBeCloseTo(0.95);
    expect(email.days).toHaveLength(90);
    expect(email.days.at(-1)).toEqual({ day: '2026-10-06', uptime: 0.9, worst: 'OUTAGE' });
    expect(email.days.at(-2)).toMatchObject({ uptime: 1, worst: 'DEGRADED' });
    expect(email.days[0]).toMatchObject({ uptime: null, worst: null });
    expect(v.components.find((c) => c.id === 'app')).toMatchObject({ state: 'OPERATIONAL', uptime: null });
    expect(v.overall).toBe('DEGRADED');
    expect(v.active.map((i) => i.title)).toEqual(['Emails delayed']);
    expect(v.checkedAt).toBe(NOW.toISOString());
  });
});
