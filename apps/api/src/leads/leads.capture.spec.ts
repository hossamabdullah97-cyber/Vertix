import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeadsService, CAPTURE_LIMITS } from './leads.service';

/**
 * The public form's guards: how often it may be sent, what a bot gets, and
 * which meeting times are taken.
 */
function setup(opts: { counts?: Record<string, number>; theme?: unknown; booked?: string[] } = {}) {
  const counts = new Map(Object.entries(opts.counts ?? {}));
  const throttle = {
    blockedFor: jest.fn(async (key: string, limit: number) => ((counts.get(key) ?? 0) >= limit ? 1800 : 0)),
    hit: jest.fn(async (key: string) => {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts.get(key)!;
    }),
  };
  const db = {
    card: { findFirst: jest.fn(async () => ({ id: 'card1', orgId: 'org1', ownerId: 'u1', theme: opts.theme ?? null })) },
    pipelineStage: { findFirst: jest.fn(async () => null) },
    lead: { create: jest.fn(async () => ({ id: 'lead1' })) },
    leadActivity: {
      create: jest.fn(async () => ({})),
      findMany: jest.fn(async () => (opts.booked ?? []).map((meetingAt) => ({ metadata: { meetingAt } }))),
    },
    nfcTag: { findFirst: jest.fn(async () => null) },
    event: { findFirst: jest.fn(async () => null) },
  };
  const notifications = { notify: jest.fn(async () => {}) };
  const webhooks = { emit: jest.fn(async () => {}), dispatch: jest.fn(async () => {}) };
  const alerts = { leadCaptured: jest.fn(async () => {}) };
  const service = new LeadsService(
    { client: db } as never,
    notifications as never,
    webhooks as never,
    new ConfigService({ DEFAULT_TIMEZONE: 'Africa/Cairo' }),
    throttle as never,
    alerts as never,
    { send: jest.fn(async () => true) } as never,
  );
  return { service, db, throttle, counts, alerts };
}

const form = { slug: 'mariam', intent: 'CONTACT' as const, name: 'Omar', email: 'omar@example.com' };

describe('LeadsService.capture guards', () => {
  it('keeps a real visitor’s details', async () => {
    const { service, db } = setup();
    await expect(service.capture(form, '1.2.3.4')).resolves.toEqual({ ok: true, leadId: 'lead1' });
    expect(db.lead.create).toHaveBeenCalled();
  });

  it('tells a bot all went well, and keeps nothing', async () => {
    const { service, db, alerts } = setup();
    await expect(service.capture({ ...form, website: 'http://spam.example' }, '1.2.3.4')).resolves.toEqual({ ok: true, leadId: null });
    expect(db.lead.create).not.toHaveBeenCalled();
    expect(alerts.leadCaptured).not.toHaveBeenCalled();
  });

  it('alerts the card owner, in the owner’s time zone', async () => {
    const { service, alerts } = setup({ theme: { availability: { timezone: 'Asia/Dubai' } } });
    await service.capture({ ...form, company: 'Nile Co', note: 'Call me' }, '1.2.3.4');
    expect(alerts.leadCaptured).toHaveBeenCalledWith('u1', expect.objectContaining({
      leadId: 'lead1',
      intent: 'CONTACT',
      name: 'Omar',
      email: 'omar@example.com',
      company: 'Nile Co',
      note: 'Call me',
      timezone: 'Asia/Dubai',
      cardName: 'mariam',
    }));
  });

  it('stops one visitor sending to one card over and over', async () => {
    const { service, db } = setup();
    for (let i = 0; i < CAPTURE_LIMITS.visitorCard; i++) await service.capture(form, '1.2.3.4');
    const err = await service.capture(form, '1.2.3.4').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect(db.lead.create).toHaveBeenCalledTimes(CAPTURE_LIMITS.visitorCard);
    // Someone else can still reach the card.
    await expect(service.capture(form, '5.6.7.8')).resolves.toMatchObject({ ok: true });
  });

  it('stops a flood to one card from many addresses', async () => {
    const { service } = setup({ counts: { 'capture-card:mariam': CAPTURE_LIMITS.card } });
    await expect(service.capture(form, '9.9.9.9')).rejects.toMatchObject({ status: 429 });
  });
});

describe('LeadsService.capture meetings', () => {
  // Tuesday 1 Dec 2026 at 10:00 Cairo (UTC+2 in winter), well ahead of now.
  const slot = '2026-12-01T08:00:00.000Z';
  const theme = { availability: { timezone: 'Africa/Cairo', days: [0, 1, 2, 3, 4], start: '09:00', end: '17:00', length: 30, notice: 0 } };
  beforeAll(() => jest.useFakeTimers({ now: new Date('2026-11-25T08:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] }));
  afterAll(() => jest.useRealTimers());

  it('books an open time', async () => {
    const { service, db } = setup({ theme });
    await service.capture({ ...form, intent: 'MEETING', meetingAt: slot }, '1.2.3.4');
    expect(db.leadActivity.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ meetingAt: slot }) }) }));
  });

  it('refuses a taken time, a time outside the hours, and meetings when they are off', async () => {
    await expect(setup({ theme, booked: [slot] }).service.capture({ ...form, intent: 'MEETING', meetingAt: slot }, '1.1.1.1')).rejects.toBeInstanceOf(ConflictException);
    await expect(setup({ theme }).service.capture({ ...form, intent: 'MEETING', meetingAt: '2026-12-01T03:00:00Z' }, '1.1.1.1')).rejects.toBeInstanceOf(ConflictException);
    await expect(setup({ theme: { availability: { enabled: false } } }).service.capture({ ...form, intent: 'MEETING', meetingAt: slot }, '1.1.1.1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ theme }).service.capture({ ...form, intent: 'MEETING' }, '1.1.1.1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
