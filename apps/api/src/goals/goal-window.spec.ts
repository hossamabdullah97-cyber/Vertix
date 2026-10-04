import { goalWindow } from './goal-window';

describe('goalWindow', () => {
  it('runs a week from Sunday midnight in Cairo', () => {
    // Tuesday 6 Oct 2026, 01:30 in Cairo (UTC+3 then) is Monday 22:30 UTC.
    const w = goalWindow('WEEK', 'Africa/Cairo', new Date('2026-10-05T22:30:00Z'));
    expect(w.from.toISOString()).toBe('2026-10-03T21:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-10-10T21:00:00.000Z');
    expect(w.elapsed).toBeGreaterThan(0.25);
    expect(w.elapsed).toBeLessThan(0.3);
  });

  it('runs a calendar month, across a change of clocks', () => {
    const w = goalWindow('MONTH', 'Africa/Cairo', new Date('2026-10-20T12:00:00Z'));
    expect(w.from.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    // Egypt's summer time ends on the last Thursday of October: November starts at UTC+2.
    expect(w.to.toISOString()).toBe('2026-10-31T22:00:00.000Z');
  });

  it('counts a Saturday night in Cairo in the week that is ending', () => {
    const w = goalWindow('WEEK', 'Africa/Cairo', new Date('2026-10-10T20:30:00Z'));
    expect(w.from.toISOString()).toBe('2026-10-03T21:00:00.000Z');
  });
});
