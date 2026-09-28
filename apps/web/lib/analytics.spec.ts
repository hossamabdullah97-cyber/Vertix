import { describe, expect, it } from 'vitest';
import { change, countByDay, dayKeys, eventSeries, formatChange, periodWindows, shareOf, type Point } from './analytics';

const point = (day: string, VIEW = 0, NFC_SCAN = 0): Point => ({ day, VIEW, CLICK: 0, SAVE: 0, SHARE: 0, NFC_SCAN });

describe('periodWindows', () => {
  it('ends on today and compares with the same number of days before it', () => {
    const w = periodWindows(7, new Date('2026-03-10T15:30:00Z'));
    expect(w.keys).toEqual(['2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
    expect(w.prevKeys[0]).toBe('2026-02-25');
    expect(w.prevKeys[6]).toBe('2026-03-03');
    expect(w.from.toISOString()).toBe('2026-03-04T00:00:00.000Z');
  });
});

describe('dayKeys', () => {
  it('crosses month ends in UTC', () => {
    expect(dayKeys(new Date('2026-01-30T00:00:00Z'), 4)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  });
});

describe('eventSeries', () => {
  it('fills days without events with zero', () => {
    const keys = ['2026-03-01', '2026-03-02', '2026-03-03'];
    expect(eventSeries([point('2026-03-01', 4), point('2026-03-03', 1, 2)], keys, 'VIEW')).toEqual([4, 0, 1]);
    expect(eventSeries([point('2026-03-03', 1, 2)], keys, 'NFC_SCAN')).toEqual([0, 0, 2]);
  });
});

describe('countByDay', () => {
  it('buckets by the UTC day of createdAt and ignores days outside the keys', () => {
    const items = [{ createdAt: '2026-03-01T23:59:00Z' }, { createdAt: '2026-03-01T01:00:00Z' }, { createdAt: '2026-02-01T00:00:00Z' }];
    expect(countByDay(items, ['2026-03-01', '2026-03-02'])).toEqual([2, 0]);
  });
});

describe('change and formatChange', () => {
  it('has no change without a previous value', () => {
    expect(change(5, 0)).toBeNull();
  });

  it('formats small changes with a decimal and large ones whole', () => {
    expect(formatChange(change(105, 100)!)).toBe('+5.0%');
    expect(formatChange(change(50, 100)!)).toBe('−50%');
  });
});

describe('shareOf', () => {
  it('is zero when there is nothing to divide by', () => {
    expect(shareOf(3, 0)).toBe(0);
    expect(shareOf(1, 4)).toBe(25);
  });
});
