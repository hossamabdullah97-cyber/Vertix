import { availabilityOf, dateIn, isOpen, openSlots, zonedToUtc, DEFAULT_AVAILABILITY } from './availability';

describe('availabilityOf', () => {
  it('fills in the defaults and the workspace zone', () => {
    expect(availabilityOf(null, 'Africa/Cairo')).toEqual({ ...DEFAULT_AVAILABILITY, timezone: 'Africa/Cairo' });
    expect(availabilityOf({ availability: { timezone: 'Nowhere/City' } }).timezone).toBe('UTC');
  });

  it('drops what does not make sense', () => {
    const a = availabilityOf({ availability: { days: [0, 0, 7, 'x', 4], start: '18:00', end: '09:00', length: 17, notice: -1 } });
    expect(a.days).toEqual([0, 4]);
    expect(a.end).toBe('17:00');
    expect(a.length).toBe(30);
    expect(a.notice).toBe(2);
  });

  it('starts an Arabic card on a Sunday-to-Thursday week', () => {
    expect(availabilityOf({ lang: 'ar' }).days).toEqual([0, 1, 2, 3, 4]);
    expect(availabilityOf({ lang: 'ar', availability: { days: [6] } }).days).toEqual([6]);
  });

  it('can be switched off', () => {
    expect(availabilityOf({ availability: { enabled: false } }).enabled).toBe(false);
  });
});

describe('zonedToUtc', () => {
  it('turns a wall-clock time in a zone into the instant', () => {
    // Cairo is UTC+3 in summer (daylight time) and UTC+2 in winter.
    expect(zonedToUtc('2026-07-01', '09:00', 'Africa/Cairo').toISOString()).toBe('2026-07-01T06:00:00.000Z');
    expect(zonedToUtc('2026-12-01', '09:00', 'Africa/Cairo').toISOString()).toBe('2026-12-01T07:00:00.000Z');
    expect(zonedToUtc('2026-03-09', '09:00', 'America/New_York').toISOString()).toBe('2026-03-09T13:00:00.000Z');
  });

  it('knows the date in a zone', () => {
    expect(dateIn(new Date('2026-09-29T22:30:00Z'), 'Africa/Cairo')).toBe('2026-09-30');
  });
});

describe('openSlots', () => {
  const a = { ...DEFAULT_AVAILABILITY, timezone: 'Africa/Cairo', days: [2], start: '09:00', end: '11:00', length: 30, notice: 2 };
  // Monday 28 Sep 2026, 10:00 Cairo.
  const now = new Date('2026-09-28T07:00:00Z');

  it('offers the working hours on working days only', () => {
    const days = openSlots(a, now, []);
    expect(days.map((d) => d.date)).toEqual(['2026-09-29', '2026-10-06']);
    expect(days[0]!.slots.map((s) => s.time)).toEqual(['09:00', '09:30', '10:00', '10:30']);
    expect(days[0]!.slots[0]!.at).toBe('2026-09-29T06:00:00.000Z');
  });

  it('leaves out booked times and the notice period', () => {
    const booked = [new Date('2026-09-29T06:30:00Z')];
    expect(openSlots(a, now, booked)[0]!.slots.map((s) => s.time)).toEqual(['09:00', '10:00', '10:30']);
    // Tuesday 09:40 Cairo: with two hours' notice, nothing is left that day.
    const late = new Date('2026-09-29T06:40:00Z');
    expect(openSlots(a, late, [])[0]!.date).toBe('2026-10-06');
  });

  it('offers nothing when meetings are off', () => {
    expect(openSlots({ ...a, enabled: false }, now, [])).toEqual([]);
  });

  it('accepts only an open time as a booking', () => {
    expect(isOpen(a, now, [], '2026-09-29T06:00:00Z')).toBe(true);
    expect(isOpen(a, now, [], '2026-09-29T06:10:00Z')).toBe(false);
    expect(isOpen(a, now, [new Date('2026-09-29T06:00:00Z')], '2026-09-29T06:00:00Z')).toBe(false);
    expect(isOpen(a, now, [], 'tomorrow')).toBe(false);
  });
});
