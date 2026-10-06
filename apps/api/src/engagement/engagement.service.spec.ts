import { BadRequestException } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { engagementHtml, engagementSubject } from './engagement-emails';

// 12:00 in Cairo (UTC+3 in October).
const NOON = new Date('2026-10-06T09:00:00Z');

type Rows = Partial<Record<'verify' | 'finish' | 'share' | 'invite' | 'waiting', object[]>>;

function setup(rows: Rows = {}, past: { userId: string; key: string; sentAt: Date }[] = []) {
  const pick = (sql: string) =>
    sql.includes('"emailVerified" IS NULL') ? 'verify'
    : sql.includes('NOT EXISTS (SELECT 1 FROM cards c WHERE c."ownerId" = u.id AND c."isPublished"') ? 'finish'
    : sql.includes("e.type = 'VIEW'") ? 'share'
    : sql.includes("o.kind = 'TEAM'") ? 'invite'
    : 'waiting';
  const created: { userId: string; key: string; kind: string }[] = [];
  const db = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => rows[pick(strings.join(''))] ?? []),
    engagementEmail: {
      findMany: jest.fn(async () => past),
      create: jest.fn(async ({ data }: { data: { userId: string; key: string; kind: string } }) => {
        if (created.some((c) => c.userId === data.userId && c.key === data.key)) throw Object.assign(new Error('dup'), { code: 'P2002' });
        created.push(data);
        return data;
      }),
      groupBy: jest.fn(async () => [{ kind: 'finishCard', _count: { _all: 3 } }]),
    },
    user: { findUnique: jest.fn(async () => ({ id: 'u1', email: 'a@b.test', name: 'Mona' })) },
    leadAlertSettings: { upsert: jest.fn(async () => ({})), count: jest.fn(async () => 2) },
  };
  const mail = { send: jest.fn(async () => true) };
  const auth = { resendVerification: jest.fn(async () => ({ ok: true, emailSent: true })) };
  const config = { get: (k: string) => ({ JWT_SECRET: 'test-secret', APP_PUBLIC_URL: 'https://app.test', DEFAULT_TIMEZONE: 'Africa/Cairo' })[k] };
  const service = new EngagementService({ client: db } as never, config as never, mail as never, auth as never);
  return { service, db, mail, auth, created };
}

const person = (id: string, extra: object = {}) => ({ id, email: `${id}@x.test`, name: 'Mona Adel', locale: null, alertLang: null, ...extra });

describe('tips and reminders', () => {
  it('send nothing outside the working day', async () => {
    const { service, mail } = setup({ finish: [person('u1', { cardId: null })] });
    expect(await service.sweep(new Date('2026-10-06T20:00:00Z'))).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('send each person one thing, the most pressing, in their language', async () => {
    const { service, mail, created } = setup({
      waiting: [person('u1', { locale: 'ar', waiting: BigInt(4), names: ['منى', 'عمر', null] })],
      finish: [person('u1', { cardId: 'c1' }), person('u2', { cardId: null, alertLang: 'ar' })],
    });
    expect(await service.sweep(NOON)).toBe(2);
    expect(created.map((c) => [c.userId, c.kind])).toEqual([
      ['u1', 'leadsWaiting'],
      ['u2', 'finishCard'],
    ]);
    const first = (mail.send.mock.calls[0] as unknown[])[0] as { subject: string; html: string };
    expect(first.subject).toBe('4 أشخاص ينتظرون ردّك');
    expect(first.html).toContain('منى، عمر وشخصان آخران');
    expect(first.html).toContain('https://app.test/leads');
    const second = (mail.send.mock.calls[1] as unknown[])[0] as { html: string };
    expect(second.html).toContain('dir="rtl"');
    expect(second.html).toContain('https://app.test/cards?new=1');
  });

  it('never the same one twice, and nothing within two days of the last', async () => {
    const { service, mail } = setup(
      { finish: [person('u1', { cardId: null })], share: [person('u2', { cardId: 'c2' })] },
      [
        { userId: 'u1', key: 'finishCard', sentAt: new Date(NOON.getTime() - 10 * 86_400_000) },
        { userId: 'u2', key: 'verifyEmail', sentAt: new Date(NOON.getTime() - 86_400_000) },
      ],
    );
    expect(await service.sweep(NOON)).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('remind about confirming the email with the confirmation itself', async () => {
    const { service, auth, mail } = setup({ verify: [person('u3')] });
    expect(await service.sweep(NOON)).toBe(1);
    expect(auth.resendVerification).toHaveBeenCalledWith('u3');
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('stop with the link in them, and only with a link made for that person', async () => {
    const { service, db } = setup();
    const url = new URL(service.unsubscribeUrl('u1'));
    expect(url.pathname).toBe('/unsubscribe');
    await service.unsubscribe('u1', url.searchParams.get('t')!);
    expect(db.leadAlertSettings.upsert).toHaveBeenCalledWith({ where: { userId: 'u1' }, create: { userId: 'u1', tips: false }, update: { tips: false } });
    await expect(service.unsubscribe('u2', url.searchParams.get('t')!)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.unsubscribe('u1', 'nope')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('count what went out for the admin console', async () => {
    const { service } = setup();
    expect(await service.stats(NOON)).toEqual({ sent: { verifyEmail: 0, finishCard: 3, shareCard: 0, inviteTeam: 0, leadsWaiting: 0 }, optedOut: 2 });
  });
});

describe('the emails', () => {
  it('escape names, link to the right place, and offer a way out', () => {
    const html = engagementHtml('inviteTeam', { name: '<b>Omar</b> Saeed', orgName: 'Nile & Co' }, 'en', 'https://app.test/', 'https://app.test/unsubscribe?u=u1&t=x');
    expect(html).toContain('Hi &lt;b&gt;Omar&lt;/b&gt;,');
    expect(html).toContain('Nile &amp; Co has one person');
    expect(html).toContain('href="https://app.test/team"');
    expect(html).toContain('href="https://app.test/unsubscribe?u=u1&amp;t=x"');
    expect(engagementSubject('leadsWaiting', { name: null, waiting: 1 }, 'en')).toBe('Someone is waiting to hear from you');
    expect(engagementSubject('leadsWaiting', { name: null, waiting: 12 }, 'ar')).toBe('12 شخصًا ينتظرون ردّك');
    expect(engagementHtml('shareCard', { name: null, cardId: 'c9' }, 'ar', 'https://app.test', 'x')).toContain('/cards/c9?share=1');
  });
});
