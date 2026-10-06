import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LeadNotesService, excerpt } from './lead-notes.service';

const MEMBERS = [
  { role: 'OWNER', user: { id: 'u_owner', name: 'Omar', email: 'omar@x.co', avatarUrl: null } },
  { role: 'MANAGER', user: { id: 'u_mgr', name: 'Mona', email: 'mona@x.co', avatarUrl: null } },
  { role: 'EMPLOYEE', user: { id: 'u_rep', name: 'Rami', email: 'rami@x.co', avatarUrl: null } },
  { role: 'EMPLOYEE', user: { id: 'u_other', name: 'Sara', email: 'sara@x.co', avatarUrl: null } },
];

function setup(opts: { lead?: unknown; note?: unknown; role?: 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE'; me?: string } = {}) {
  const db = {
    lead: { findFirst: jest.fn(async () => (opts.lead === undefined ? { id: 'l1', name: 'Hana', company: 'Nile', assignedTo: 'u_rep', card: null } : opts.lead)) },
    membership: { findMany: jest.fn(async () => MEMBERS) },
    leadActivity: {
      create: jest.fn(async ({ data }: { data: { metadata: unknown } }) => ({ id: 'a1', type: 'NOTE', metadata: data.metadata, createdAt: new Date() })),
      findFirst: jest.fn(async () => opts.note ?? null),
      update: jest.fn(async ({ data }: { data: { metadata: unknown } }) => ({ id: 'a1', type: 'NOTE', metadata: data.metadata, createdAt: new Date() })),
      delete: jest.fn(async () => ({})),
      findMany: jest.fn(async () => []),
    },
    user: { findMany: jest.fn(async () => [{ id: 'u_mgr', name: 'Mona', email: 'mona@x.co', avatarUrl: null }]) },
  };
  const notifications = { notifyMany: jest.fn(async () => undefined) };
  const service = new LeadNotesService({ client: db } as never, notifications as never);
  const viewer = { orgId: 'org1', userId: opts.me ?? 'u_mgr', role: opts.role ?? 'MANAGER' } as const;
  return { service, db, notifications, viewer };
}

describe('who a note can name', () => {
  it('is the teammates who can open the lead: managers and above, its owner, and whoever’s card brought it', async () => {
    const { service, viewer } = setup();
    const list = await service.mentionable(viewer, 'l1');
    // The writer (Mona) is not offered.
    expect(list.map((m) => m.id)).toEqual(['u_owner', 'u_rep']);
  });

  it('is nobody, for a lead the viewer cannot see', async () => {
    const { service, viewer } = setup({ lead: null });
    await expect(service.mentionable(viewer, 'l1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('writing a note', () => {
  it('keeps who wrote it and who it names, and tells each of them once', async () => {
    const { service, db, notifications, viewer } = setup();
    const out = await service.add(viewer, 'l1', 'Call @Rami back about the quote', ['u_rep', 'u_rep', 'u_other', 'u_mgr']);
    const meta = db.leadActivity.create.mock.calls[0]![0].data.metadata as Record<string, unknown>;
    // Sara cannot see this lead, and the writer is not told about their own note.
    expect(meta).toMatchObject({ note: 'Call @Rami back about the quote', by: 'u_mgr', mentions: [{ id: 'u_rep', name: 'Rami' }], mentionIds: ['u_rep'] });
    expect(notifications.notifyMany).toHaveBeenCalledWith(
      ['u_rep'],
      expect.objectContaining({ type: 'lead.mentioned', actorId: 'u_mgr', body: 'Call @Rami back about the quote', metadata: { leadId: 'l1', leadName: 'Hana', noteId: 'a1' } }),
    );
    expect(out.author).toEqual({ id: 'u_mgr', name: 'Mona', avatarUrl: null });
  });

  it('tells nobody when it names nobody', async () => {
    const { service, notifications, viewer } = setup();
    await service.add(viewer, 'l1', 'Plain note');
    expect(notifications.notifyMany).not.toHaveBeenCalled();
  });
});

describe('changing and deleting notes', () => {
  const mine = { id: 'a1', metadata: { note: 'old', by: 'u_mgr', mentions: [{ id: 'u_rep', name: 'Rami' }], mentionIds: ['u_rep'] } };

  it('lets the writer change it, and tells only the teammates newly named', async () => {
    const { service, db, notifications, viewer } = setup({ note: mine });
    await service.edit(viewer, 'l1', 'a1', { note: 'new text', mentions: ['u_rep', 'u_owner'] });
    expect(db.leadActivity.update.mock.calls[0]![0].data.metadata).toMatchObject({ note: 'new text', mentionIds: ['u_rep', 'u_owner'], editedAt: expect.any(String) });
    expect(notifications.notifyMany).toHaveBeenCalledWith(['u_owner'], expect.anything());
  });

  it('keeps others from changing it', async () => {
    const { service, viewer } = setup({ note: mine, me: 'u_owner', role: 'OWNER' });
    await expect(service.edit(viewer, 'l1', 'a1', { note: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets the writer or an admin delete it, and nobody else', async () => {
    const admin = setup({ note: mine, me: 'u_owner', role: 'OWNER' });
    await expect(admin.service.remove(admin.viewer, 'l1', 'a1')).resolves.toEqual({ ok: true });
    const rep = setup({ note: mine, me: 'u_rep', role: 'EMPLOYEE' });
    await expect(rep.service.remove(rep.viewer, 'l1', 'a1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('the team’s notes', () => {
  it('are only on the viewer’s leads in the viewer’s workspace, and can be narrowed to those naming them', async () => {
    const { service, db } = setup();
    await service.feed({ orgId: 'org1', userId: 'u_rep', role: 'EMPLOYEE' }, 'mentions');
    const where = (db.leadActivity.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toEqual({
      type: 'NOTE',
      lead: { orgId: 'org1', deletedAt: null, OR: [{ assignedTo: 'u_rep' }, { card: { ownerId: 'u_rep' } }] },
      metadata: { path: ['mentionIds'], array_contains: ['u_rep'] },
    });
  });

  it('shortens a note for a notification', () => {
    expect(excerpt('a\n\nb')).toBe('a b');
    expect(excerpt('x'.repeat(200))).toHaveLength(140);
  });
});
