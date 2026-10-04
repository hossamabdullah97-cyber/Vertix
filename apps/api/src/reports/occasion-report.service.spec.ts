import { NotFoundException } from '@nestjs/common';
import { OccasionReportService } from './occasion-report.service';

const ov = (leads: number, taps: number, uv: number, views = 0) => ({ totals: { NFC_SCAN: taps, VIEW: views }, uniqueVisitors: uv, leads });

function setup(occasion: unknown, raw: unknown[][] = []) {
  const queue = [...raw];
  const db = {
    occasion: { findFirst: jest.fn().mockResolvedValue(occasion) },
    // dayRows, hourRows, meetings, reply, won, in that order
    $queryRaw: jest.fn(async () => queue.shift() ?? []),
    lead: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const analytics = {
    overview: jest.fn().mockResolvedValueOnce(ov(12, 40, 90, 200)).mockResolvedValueOnce(ov(28, 56, 140)),
    memberPerformance: jest.fn().mockResolvedValue([{ user: { id: 'u', name: 'Omar', email: 'o@x' }, leads: 12, scans: 40, visitors: 90, wonLeads: 1 }, { user: { id: 'v', name: 'Idle', email: 'i@x' }, leads: 0, scans: 0, visitors: 0, wonLeads: 0 }]),
    tagPerformance: jest.fn().mockResolvedValue([]),
  };
  const service = new OccasionReportService({ client: db } as never, analytics as never, { get: () => 'Africa/Cairo' } as never);
  return { service, db, analytics };
}

const tenant = { orgId: 'o1', userId: 'u1', role: 'OWNER' } as never;
const expo = { id: 'e1', name: 'Cairo ICT', startsOn: new Date('2026-11-15T00:00:00Z'), endsOn: new Date('2026-11-17T00:00:00Z') };

describe('OccasionReportService', () => {
  it('counts a running occasion up to now, every day of it, against the four weeks before', async () => {
    const now = new Date('2026-11-16T15:00:00Z');
    const { service, analytics } = setup(expo, [[{ day: '2026-11-15', taps: 30, views: 150 }], [{ hour: 14, n: 25 }], [{ n: 3 }], [{ contacted: 8, median: 2.25 }], [{ n: 1, value: 50000 }]]);
    const r = await service.report(tenant, 'e1', now);
    expect(r.occasion).toMatchObject({ status: 'live', day: 2, days: 3, startsOn: '2026-11-15', endsOn: '2026-11-17' });
    expect(analytics.overview).toHaveBeenNthCalledWith(1, 'o1', new Date('2026-11-15T00:00:00Z'), now);
    expect(analytics.overview).toHaveBeenNthCalledWith(2, 'o1', new Date('2026-10-18T00:00:00Z'), new Date('2026-11-15T00:00:00Z'));
    expect(r.days.map((d) => [d.date, d.taps])).toEqual([['2026-11-15', 30], ['2026-11-16', 0], ['2026-11-17', 0]]);
    expect(r.hours[14]).toBe(25);
    expect(r.usual).toEqual({ leads: 1, taps: 2, reached: 5 });
    expect(r.totals).toMatchObject({ leads: 12, taps: 40, reached: 90, meetings: 3, contacted: 8, medianReplyHours: 2.3, won: { count: 1, value: 50000 } });
    // Members with nothing to show are left out.
    expect(r.members.map((m) => m.user.name)).toEqual(['Omar']);
  });

  it('knows an occasion that has not started or is over', async () => {
    const before = await setup(expo).service.report(tenant, 'e1', new Date('2026-11-01T10:00:00Z'));
    expect(before.occasion).toMatchObject({ status: 'upcoming', day: null });
    const after = await setup(expo).service.report(tenant, 'e1', new Date('2026-12-01T10:00:00Z'));
    expect(after.occasion).toMatchObject({ status: 'past', day: null });
  });

  it('refuses an occasion of another workspace', async () => {
    await expect(setup(null).service.report(tenant, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
