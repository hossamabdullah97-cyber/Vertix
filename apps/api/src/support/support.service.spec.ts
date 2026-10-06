import { NotFoundException } from '@nestjs/common';
import { SupportService, newRef } from './support.service';

function setup(env: Record<string, string> = {}, { collide = 0 } = {}) {
  let tries = 0;
  const db = {
    user: { findUnique: jest.fn(async () => ({ email: 'mona@nile.test', name: 'Mona <Adel>' })) },
    organization: { findUnique: jest.fn(async () => ({ id: 'o1', name: 'Nile Co' })) },
    supportRequest: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (tries++ < collide) throw Object.assign(new Error('unique'), { code: 'P2002' });
        return { id: 'r1', status: 'OPEN', createdAt: new Date('2026-10-06T10:00:00Z'), closedAt: null, ...data };
      }),
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    helpFeedback: {
      upsert: jest.fn(async () => ({})),
      groupBy: jest.fn(async () => [
        { article: 'share-card', helpful: true, _count: { _all: 5 } },
        { article: 'import-leads', helpful: false, _count: { _all: 2 } },
        { article: 'import-leads', helpful: true, _count: { _all: 1 } },
      ]),
    },
  };
  const mail = { send: jest.fn(async () => true) };
  const config = { get: (k: string) => ({ APP_PUBLIC_URL: 'https://app.test', ...env })[k] };
  const service = new SupportService({ client: db } as never, config as never, mail as never);
  return { service, db, mail };
}

const input = { topic: 'leads' as const, subject: 'Import stops', message: 'The file stops at row 40 <b>always</b>.', page: '/leads?lead=abc', lang: 'ar' as const };

describe('support requests', () => {
  it('makes short references without letters that look alike', () => {
    for (let i = 0; i < 50; i++) expect(newRef()).toMatch(/^VX-[A-HJ-NP-Z2-9]{6}$/);
  });

  it('keeps the request with who and where, mails the inbox (reply goes to them) and confirms in their language', async () => {
    const { service, db, mail } = setup({ SUPPORT_INBOX_EMAIL: 'help@vertex.test' });
    const r = await service.create('u1', input, { tenant: { orgId: 'o1' } as never, userAgent: 'UA' });
    expect(db.supportRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', email: 'mona@nile.test', orgName: 'Nile Co', topic: 'leads', page: '/leads', userAgent: 'UA' }),
    });
    expect(r).toMatchObject({ ref: expect.stringMatching(/^VX-/), status: 'OPEN', subject: 'Import stops' });
    const [inbox, confirm] = mail.send.mock.calls.map((c) => (c as unknown[])[0] as { to: string; replyTo?: string; subject: string; html: string });
    expect(inbox).toMatchObject({ to: 'help@vertex.test', replyTo: 'mona@nile.test', subject: `[${r.ref}] Leads: Import stops` });
    expect(inbox!.html).toContain('&lt;b&gt;always');
    expect(inbox!.html).not.toContain('<b>always');
    expect(confirm).toMatchObject({ to: 'mona@nile.test', replyTo: 'help@vertex.test', subject: `وصلتنا رسالتك (${r.ref})` });
    expect(confirm!.html).toContain('dir="rtl"');
  });

  it('falls back to the ops address, and still keeps the request with no inbox at all', async () => {
    const ops = setup({ OPS_ALERT_EMAIL: 'ops@vertex.test' });
    await ops.service.create('u1', input, {});
    expect(ops.mail.send.mock.calls.map((c) => ((c as unknown[])[0] as { to: string }).to)).toEqual(['ops@vertex.test', 'mona@nile.test']);
    expect(ops.db.organization.findUnique).not.toHaveBeenCalled();

    const none = setup();
    await none.service.create('u1', input, {});
    expect(none.db.supportRequest.create).toHaveBeenCalled();
    expect(none.mail.send.mock.calls.map((c) => ((c as unknown[])[0] as { to: string }).to)).toEqual(['mona@nile.test']);
  });

  it('tries another reference when one is taken', async () => {
    const { service, db } = setup({}, { collide: 2 });
    await service.create('u1', input, {});
    expect(db.supportRequest.create).toHaveBeenCalledTimes(3);
  });

  it('closes and reopens, and says when there is no such request', async () => {
    const { service, db } = setup();
    await service.setClosed('r1', true);
    expect(db.supportRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'CLOSED', closedAt: expect.any(Date) } });
    db.supportRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.setClosed('nope', false)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps one answer per person per article, and lists the least helpful first', async () => {
    const { service, db } = setup();
    await service.feedback('u1', { article: 'share-card', helpful: false });
    expect(db.helpFeedback.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { article_userId: { article: 'share-card', userId: 'u1' } }, update: { helpful: false } }));
    expect(await service.feedbackSummary()).toEqual([
      { article: 'import-leads', helpful: 1, notHelpful: 2 },
      { article: 'share-card', helpful: 5, notHelpful: 0 },
    ]);
  });
});
