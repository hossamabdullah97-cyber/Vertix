import { UsageTracker, featureOf } from './usage-tracker';
import { retention, weekStart } from './usage.service';

describe('which part of the product a call is', () => {
  it('maps paths to features, counts sign-in alone as use, and skips what is not use', () => {
    expect(featureOf('/api/leads/abc?x=1')).toBe('leads');
    expect(featureOf('/api/tasks')).toBe('leads');
    expect(featureOf('/api/nfc/tags')).toBe('chips');
    expect(featureOf('/api/orgs/members')).toBe('team');
    expect(featureOf('/api/auth/me')).toBeNull();
    expect(featureOf('/api/admin/usage')).toBeUndefined();
    expect(featureOf('/api/c/some-card')).toBeUndefined();
    expect(featureOf('/api/health')).toBeUndefined();
  });
});

describe('noting use', () => {
  function setup() {
    const createMany = jest.fn(async () => ({ count: 1 }));
    return { tracker: new UsageTracker({ client: { activityDay: { createMany } } } as never), createMany };
  }

  it('writes each person, day and feature once', async () => {
    const { tracker, createMany } = setup();
    const at = new Date('2026-10-06T10:00:00Z');
    tracker.note('u1', 'leads', at);
    tracker.note('u1', 'leads', at);
    tracker.note('u1', null, at);
    tracker.note('u1', 'cards', at);
    expect(createMany.mock.calls.map((c) => (c as unknown as [{ data: { feature: string }[] }])[0].data.map((r) => r.feature))).toEqual([['_', 'leads'], ['cards']]);
    tracker.note('u1', 'leads', new Date('2026-10-07T10:00:00Z'));
    expect(createMany).toHaveBeenLastCalledWith({ data: [{ userId: 'u1', day: '2026-10-07', feature: '_' }, { userId: 'u1', day: '2026-10-07', feature: 'leads' }], skipDuplicates: true });
  });
});

describe('retention', () => {
  const now = new Date('2026-10-14T12:00:00Z'); // a Wednesday

  it('starts weeks on Monday', () => {
    expect(weekStart(now).toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });

  it('gives each cohort the share active in each week after, and nothing for weeks to come', () => {
    const cohorts = [
      { id: 'a', createdAt: new Date('2026-10-05T09:00:00Z') },
      { id: 'b', createdAt: new Date('2026-10-06T09:00:00Z') },
      { id: 'c', createdAt: new Date('2026-10-13T09:00:00Z') },
    ];
    const active = [
      { userId: 'a', day: '2026-10-05' },
      { userId: 'b', day: '2026-10-07' },
      { userId: 'a', day: '2026-10-13' },
      { userId: 'c', day: '2026-10-13' },
    ];
    const r = retention(cohorts, active, now, 3);
    expect(r.map((x) => x.week)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
    expect(r[0]).toEqual({ week: '2026-09-28', size: 0, weeks: [null, null, null] });
    expect(r[1]).toEqual({ week: '2026-10-05', size: 2, weeks: [1, 0.5, null] });
    expect(r[2]).toEqual({ week: '2026-10-12', size: 1, weeks: [1, null, null] });
  });
});
