import {
  calculateResolutionScore,
  evaluateSchedule,
  type VisitorContext,
} from './cards.service';

/**
 * The resolver decides which profile a visitor sees on a card's single public
 * link. Getting this wrong is not cosmetic: a false positive silently replaces
 * the profile printed on someone's NFC card, and a false negative on an
 * access-key variant leaks a private profile onto the public link.
 */

const NOW = new Date('2026-03-15T12:00:00Z');

function visitor(over: Partial<VisitorContext> = {}): VisitorContext {
  return {
    device: 'Desktop',
    os: 'Windows',
    browser: 'Chrome',
    language: 'en',
    country: '',
    region: '',
    city: '',
    timezone: 'UTC',
    trafficSource: 'direct',
    visitorType: 'new',
    dateTime: NOW,
    ip: '1.2.3.4',
    ...over,
  };
}

/** A variant as the Profiles editor creates it: named, with nothing turned on. */
function variant(over: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    name: 'Profile 1',
    order: 0,
    templateId: 'swiss-indigo',
    theme: null,
    vcardData: null,
    accessKey: null,
    passcode: null,
    scheduleStart: null,
    scheduleEnd: null,
    manualActive: false,
    ...over,
  };
}

const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe('calculateResolutionScore — keyless profiles', () => {
  it('does not match a freshly added profile that the owner has not activated', () => {
    // Regression: a variant with no schedule was treated as "always on", so
    // clicking "Add profile" instantly hijacked the card's public link.
    expect(calculateResolutionScore(variant(), visitor()).isMatch).toBe(false);
  });

  it('matches when the owner flips "Activate now"', () => {
    expect(
      calculateResolutionScore(variant({ manualActive: true }), visitor()).isMatch,
    ).toBe(true);
  });

  it('stops matching once "Activate now" is turned back off', () => {
    expect(
      calculateResolutionScore(variant({ manualActive: false }), visitor()).isMatch,
    ).toBe(false);
  });

  it('matches inside its schedule window and not outside it', () => {
    const scheduled = variant({
      scheduleStart: hoursFromNow(-1),
      scheduleEnd: hoursFromNow(1),
    });
    expect(calculateResolutionScore(scheduled, visitor()).isMatch).toBe(true);

    const expired = variant({
      scheduleStart: hoursFromNow(-4),
      scheduleEnd: hoursFromNow(-2),
    });
    expect(calculateResolutionScore(expired, visitor()).isMatch).toBe(false);

    const future = variant({
      scheduleStart: hoursFromNow(2),
      scheduleEnd: hoursFromNow(4),
    });
    expect(calculateResolutionScore(future, visitor()).isMatch).toBe(false);
  });

  it('treats an open-ended schedule as a half-open window', () => {
    const startedNoEnd = variant({ scheduleStart: hoursFromNow(-1) });
    expect(calculateResolutionScore(startedNoEnd, visitor()).isMatch).toBe(true);

    const endsLaterNoStart = variant({ scheduleEnd: hoursFromNow(1) });
    expect(calculateResolutionScore(endsLaterNoStart, visitor()).isMatch).toBe(true);

    const endedNoStart = variant({ scheduleEnd: hoursFromNow(-1) });
    expect(calculateResolutionScore(endedNoStart, visitor()).isMatch).toBe(false);
  });

  it('lets "Activate now" override an expired window — it is an explicit override', () => {
    const expiredButOn = variant({
      scheduleStart: hoursFromNow(-4),
      scheduleEnd: hoursFromNow(-2),
      manualActive: true,
    });
    expect(calculateResolutionScore(expiredButOn, visitor()).isMatch).toBe(true);
  });
});

describe('calculateResolutionScore — access-key profiles', () => {
  const vip = variant({ id: 'vip', name: 'VIP', accessKey: 'gold' });

  it('stays hidden on the public link', () => {
    expect(calculateResolutionScore(vip, visitor()).isMatch).toBe(false);
  });

  it('matches only when the visitor presents the exact key', () => {
    expect(calculateResolutionScore(vip, visitor({ p: 'gold' })).isMatch).toBe(true);
    expect(calculateResolutionScore(vip, visitor({ p: 'GOLD' })).isMatch).toBe(false);
    expect(calculateResolutionScore(vip, visitor({ p: 'silver' })).isMatch).toBe(false);
  });

  it('ignores schedule and activation — the key alone decides', () => {
    const keyedAndExpired = variant({
      accessKey: 'gold',
      scheduleStart: hoursFromNow(-4),
      scheduleEnd: hoursFromNow(-2),
      manualActive: false,
    });
    expect(
      calculateResolutionScore(keyedAndExpired, visitor({ p: 'gold' })).isMatch,
    ).toBe(true);
  });

  it('outranks any keyless profile so a shared link always wins', () => {
    const keyed = calculateResolutionScore(vip, visitor({ p: 'gold' }));
    const open = calculateResolutionScore(
      variant({ manualActive: true }),
      visitor({ p: 'gold' }),
    );
    expect(keyed.isMatch && open.isMatch).toBe(true);
    expect(keyed.priority).toBeLessThan(open.priority);
  });
});

describe('evaluateSchedule', () => {
  it('honours an explicit rules-engine window over the variant columns', () => {
    const v = variant({ scheduleStart: hoursFromNow(-4), scheduleEnd: hoursFromNow(-2) });
    const alwaysOn = { type: 'always' };
    expect(evaluateSchedule(v, alwaysOn, NOW)).toBe(true);
  });

  it('evaluates business hours against the given moment', () => {
    const cfg = { type: 'businessHours' };
    // 2026-03-16 is a Monday; 10:00 is inside 09:00–17:00, 20:00 is not.
    expect(evaluateSchedule(variant(), cfg, new Date('2026-03-16T10:00:00'))).toBe(true);
    expect(evaluateSchedule(variant(), cfg, new Date('2026-03-16T20:00:00'))).toBe(false);
    // 2026-03-15 is a Sunday — outside business hours regardless of the clock.
    expect(evaluateSchedule(variant(), cfg, new Date('2026-03-15T10:00:00'))).toBe(false);
  });

  it('separates weekdays from the weekend', () => {
    const weekdays = { type: 'weekdays' };
    const weekend = { type: 'weekend' };
    const monday = new Date('2026-03-16T10:00:00');
    const sunday = new Date('2026-03-15T10:00:00');
    expect(evaluateSchedule(variant(), weekdays, monday)).toBe(true);
    expect(evaluateSchedule(variant(), weekdays, sunday)).toBe(false);
    expect(evaluateSchedule(variant(), weekend, sunday)).toBe(true);
    expect(evaluateSchedule(variant(), weekend, monday)).toBe(false);
  });
});
