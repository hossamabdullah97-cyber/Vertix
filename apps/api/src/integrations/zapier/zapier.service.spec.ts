import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ZapierService, isZapierHook } from './zapier.service';

const tenant = { orgId: 'o1', userId: 'u1', role: 'OWNER' as const };

function make(opts: { hook?: Record<string, unknown> | null; leads?: unknown[] } = {}) {
  const db = {
    organization: { findUnique: jest.fn(async () => ({ id: 'o1', name: 'Acme', slug: 'acme' })) },
    webhookEndpoint: {
      findFirst: jest.fn(async () => (opts.hook === undefined ? { id: 'w1', url: 'https://hooks.zapier.com/hooks/catch/1/abc/', events: ['lead.created'] } : opts.hook)),
      findMany: jest.fn(async () => [{ id: 'w1', url: 'https://hooks.zapier.com/hooks/catch/1/abcdefgh/', events: ['lead.created'], enabled: true, createdAt: new Date() }]),
    },
    lead: { findMany: jest.fn(async () => opts.leads ?? []) },
  };
  const webhooks = { create: jest.fn(async () => ({ id: 'w1', secret: 'whsec_x' })), remove: jest.fn(async () => ({ ok: true })) };
  return { service: new ZapierService({ client: db } as never, webhooks as never), db, webhooks };
}

describe('Zapier', () => {
  it('only takes hook addresses on Zapier’s own hosts', () => {
    expect(isZapierHook('https://hooks.zapier.com/hooks/catch/1/abc/')).toBe(true);
    expect(isZapierHook('http://hooks.zapier.com/x')).toBe(false);
    expect(isZapierHook('https://hooks.zapier.com.evil.example/x')).toBe(false);
    expect(isZapierHook('https://example.com/zapier.com')).toBe(false);
  });

  it('names the connection after the workspace', async () => {
    await expect(make().service.me(tenant)).resolves.toEqual({ workspaceId: 'o1', workspace: 'Acme', slug: 'acme' });
  });

  it('subscribes a Zap to one event, as a webhook named for Zapier, without handing out its secret', async () => {
    const { service, webhooks } = make();
    await expect(service.subscribe(tenant, { hookUrl: 'https://hooks.zapier.com/hooks/catch/1/abc/', event: 'meeting.requested' })).resolves.toEqual({ id: 'w1', event: 'meeting.requested' });
    expect(webhooks.create).toHaveBeenCalledWith(tenant, { url: 'https://hooks.zapier.com/hooks/catch/1/abc/', description: 'Zapier: meeting.requested', events: ['meeting.requested'] });
  });

  it('refuses another site, or an event a Zap cannot start from', async () => {
    const { service, webhooks } = make();
    await expect(service.subscribe(tenant, { hookUrl: 'https://example.com/hook', event: 'lead.created' })).rejects.toThrow(BadRequestException);
    await expect(service.subscribe(tenant, { hookUrl: 'https://hooks.zapier.com/x', event: 'member.added' })).rejects.toThrow('Zaps can start from');
    expect(webhooks.create).not.toHaveBeenCalled();
  });

  it('unsubscribes only the workspace’s Zapier hooks', async () => {
    const ok = make();
    await ok.service.unsubscribe(tenant, 'w1');
    expect(ok.webhooks.remove).toHaveBeenCalledWith(tenant, 'w1');
    expect(ok.db.webhookEndpoint.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'w1', deletedAt: null, description: { startsWith: 'Zapier' } } }));
    const other = make({ hook: null });
    await expect(other.service.unsubscribe(tenant, 'w2')).rejects.toThrow(NotFoundException);
    expect(other.webhooks.remove).not.toHaveBeenCalled();
  });

  it('lists the hooks without their full address', async () => {
    const [h] = await make().service.hooks();
    expect(h!.url).toBe('…bcdefgh/');
    expect(h!.url).not.toContain('hooks.zapier.com');
  });

  it('samples real leads shaped like the event, and an example when there are none', async () => {
    const lead = { id: 'l1', name: 'Laila', email: 'l@x.co', phone: null, company: 'Nile', source: 'meeting', temperature: 'HOT', createdAt: new Date('2026-10-07T09:00:00Z'), card: { slug: 'omar' }, activities: [{ metadata: { intent: 'MEETING', meetingAt: '2026-10-08T08:00:00.000Z' } }] };
    const real = await make({ leads: [lead] }).service.samples(tenant, 'meeting.requested');
    expect(real).toEqual([
      { id: 'sample_l1', event_created_at: '2026-10-07T09:00:00.000Z', leadId: 'l1', name: 'Laila', email: 'l@x.co', phone: null, company: 'Nile', source: 'meeting', intent: 'MEETING', temperature: 'HOT', cardSlug: 'omar', meetingAt: '2026-10-08T08:00:00.000Z' },
    ]);
    const none = await make().service.samples(tenant, 'card.viewed');
    expect(none[0]).toMatchObject({ id: 'sample_card.viewed', slug: 'omar-saeed' });
  });
});
