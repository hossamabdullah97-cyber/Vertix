import type { TenantContext } from '@vertex/db';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeadsService } from './leads.service';
import { bookedMeetings } from '../cards/booked-meetings';

const owner = { orgId: 'o1', userId: 'u1', role: 'OWNER' } as TenantContext;
const future = new Date(Date.now() + 3 * 86_400_000);
future.setUTCMinutes(0, 0, 0);

function setup(opts: { meta?: Record<string, unknown>; email?: string | null; others?: Record<string, unknown>[]; lead?: unknown } = {}) {
  const request = { id: 'act1', metadata: { intent: 'MEETING', note: 'About the fit-out', meetingAt: future.toISOString(), ...opts.meta }, createdAt: new Date() };
  const lead =
    opts.lead === undefined
      ? {
          id: 'lead1',
          name: 'Omar Adel',
          email: opts.email === undefined ? 'omar@example.com' : opts.email,
          cardId: 'card1',
          card: {
            slug: 'mariam',
            theme: { lang: 'en', availability: { timezone: 'Africa/Cairo', length: 45 } },
            vcardData: { fullName: 'Mariam Khaled', title: 'Sales Director', company: 'Vertex Build' },
            owner: { email: 'owner@example.com', name: 'Owner' },
          },
          activities: [{ id: 'note', metadata: { note: 'called', meetingAt: null, manual: true }, createdAt: new Date() }, request],
        }
      : opts.lead;
  const db = {
    lead: { findFirst: jest.fn(async () => lead) },
    leadActivity: {
      findMany: jest.fn(async () => (opts.others ?? []).map((metadata) => ({ metadata }))),
      update: jest.fn(async ({ data }: { data: { metadata: unknown } }) => ({ id: 'act1', type: 'MEETING', metadata: data.metadata, createdAt: new Date() })),
    },
  };
  const mail = { send: jest.fn(async () => true) };
  const service = new LeadsService(
    { client: db } as never,
    {} as never,
    {} as never,
    new ConfigService({ APP_PUBLIC_URL: 'https://app.example' }),
    {} as never,
    {} as never,
    mail as never,
  );
  return { service, db, mail };
}

describe('LeadsService.respondToMeeting', () => {
  it('accepts, emails the visitor an invite, and replies go to the owner', async () => {
    const { service, db, mail } = setup();
    const res = await service.respondToMeeting(owner, 'lead1', { decision: 'ACCEPT', message: 'See you then' });
    expect(res.emailed).toBe(true);
    expect(db.leadActivity.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'act1' } }));
    expect(res.activity.metadata).toMatchObject({ status: 'ACCEPTED', decidedBy: 'u1', reply: 'See you then', note: 'About the fit-out' });
    const sent = (mail.send.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(sent.to).toBe('omar@example.com');
    expect(sent.replyTo).toBe('owner@example.com');
    expect(sent.subject).toBe('Your meeting with Mariam Khaled is confirmed');
    expect(sent.attachments[0].filename).toBe('meeting.ics');
    expect(sent.attachments[0].content).toContain('DTSTART:');
    // 45-minute meetings, from the card's availability.
    const start = future.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const end = new Date(future.getTime() + 45 * 60_000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    expect(sent.attachments[0].content).toContain(`DTSTART:${start}`);
    expect(sent.attachments[0].content).toContain(`DTEND:${end}`);
    expect(sent.html).toContain('https://app.example/c/mariam');
  });

  it('declines with no invite attached', async () => {
    const { service, mail } = setup();
    await service.respondToMeeting(owner, 'lead1', { decision: 'DECLINE' });
    const sent = (mail.send.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(sent.subject).toBe('About your meeting request with Mariam Khaled');
    expect(sent.attachments).toBeUndefined();
  });

  it('answers without an email when the visitor left only a phone', async () => {
    const { service, mail } = setup({ email: null });
    await expect(service.respondToMeeting(owner, 'lead1', { decision: 'ACCEPT' })).resolves.toMatchObject({ emailed: false });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('will not answer the same way twice', async () => {
    const { service } = setup({ meta: { status: 'ACCEPTED' } });
    await expect(service.respondToMeeting(owner, 'lead1', { decision: 'ACCEPT' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.respondToMeeting(owner, 'lead1', { decision: 'DECLINE' })).resolves.toBeDefined();
  });

  it('will not accept a time that has passed', async () => {
    const { service } = setup({ meta: { meetingAt: '2020-01-01T09:00:00.000Z' } });
    await expect(service.respondToMeeting(owner, 'lead1', { decision: 'ACCEPT' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('will not take back a declined time someone else has asked for since', async () => {
    const { service } = setup({ meta: { status: 'DECLINED' }, others: [{ meetingAt: future.toISOString() }] });
    await expect(service.respondToMeeting(owner, 'lead1', { decision: 'ACCEPT' })).rejects.toBeInstanceOf(ConflictException);
    const free = setup({ meta: { status: 'DECLINED' }, others: [{ meetingAt: future.toISOString(), status: 'DECLINED' }] });
    await expect(free.service.respondToMeeting(owner, 'lead1', { decision: 'ACCEPT' })).resolves.toBeDefined();
  });

  it('needs a meeting request, not a meeting someone logged', async () => {
    const { service } = setup({
      lead: { id: 'lead1', name: 'x', email: null, cardId: 'card1', card: { slug: 's', theme: null, vcardData: null, owner: { email: 'o', name: null } }, activities: [{ id: 'm', metadata: { meetingAt: future.toISOString(), manual: true } }] },
    });
    await expect(service.respondToMeeting(owner, 'lead1', { decision: 'ACCEPT' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ lead: null }).service.meetingIcs(owner, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gives the owner the meeting as a calendar file', async () => {
    const ics = await setup().service.meetingIcs(owner, 'lead1');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:Omar Adel · Mariam Khaled');
    expect(ics).toContain('ATTENDEE;CN=Omar Adel');
  });
});

describe('bookedMeetings', () => {
  it('gives a declined time back', async () => {
    const now = new Date();
    const at = new Date(now.getTime() + 86_400_000).toISOString();
    const db = { leadActivity: { findMany: jest.fn(async () => [{ metadata: { meetingAt: at } }, { metadata: { meetingAt: at, status: 'DECLINED' } }]) } };
    await expect(bookedMeetings(db, 'card1', now)).resolves.toHaveLength(1);
  });
});
