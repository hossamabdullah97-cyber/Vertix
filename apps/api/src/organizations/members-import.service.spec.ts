import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MembersImportService, slugOf } from './members-import.service';

const tenant = { orgId: 'org1', userId: 'admin1', role: 'ADMIN' } as never;

function setup(opts: { teams?: { id: string; name: string }[]; invite?: jest.Mock; cardOwners?: string[]; seats?: number; held?: string[] } = {}) {
  const users = new Map<string, string>();
  const db = {
    organization: { findUnique: jest.fn(async () => ({ name: 'Vertex Build' })) },
    team: { findMany: jest.fn(async () => opts.teams ?? []) },
    user: {
      findFirst: jest.fn(async ({ where }: { where: { email: { equals: string } } }) => {
        const e = where.email.equals;
        if (!users.has(e)) users.set(e, `u-${users.size + 1}`);
        return { id: users.get(e) };
      }),
    },
    card: {
      findFirst: jest.fn(async ({ where }: { where: { ownerId: string } }) => ((opts.cardOwners ?? []).includes(where.ownerId) ? { id: 'old' } : null)),
      update: jest.fn(async () => ({})),
    },
    cardAction: { createMany: jest.fn(async () => ({ count: 1 })) },
    membership: {
      findFirst: jest.fn(async ({ where }: { where: { user: { email: { equals: string } } } }) => ((opts.held ?? []).includes(where.user.email.equals) ? { id: 'm' } : null)),
    },
  };
  let seats = opts.seats ?? Infinity;
  const limits = {
    assertWithin: jest.fn(async () => {
      if (seats <= 0) throw new ForbiddenException('Plan limit reached (Pro: 5 members). Upgrade your plan to add more.');
      seats--;
    }),
  };
  const members = { invite: opts.invite ?? jest.fn(async (_t: unknown, i: { email: string }) => ({ status: 'invited', email: i.email, emailSent: true })) };
  let n = 0;
  const teams = { create: jest.fn(async (_t: unknown, i: { name: string }) => ({ id: `t-new-${++n}`, name: i.name })) };
  const cards = { create: jest.fn(async () => ({ id: `card-${++n}` })) };
  const audit = { log: jest.fn(async () => {}) };
  const service = new MembersImportService({ client: db } as never, members as never, teams as never, cards as never, audit as never, limits as never);
  return { service, db, members, teams, cards, audit, limits };
}

const row = (over: Record<string, unknown> = {}) => ({ email: 'mona@example.com', name: 'Mona Adel', title: 'Designer', phone: '+20 100 123 4567', team: 'Sales', role: 'EMPLOYEE' as const, ...over });

describe('MembersImportService', () => {
  it('invites each row onto its team, making teams the org does not have', async () => {
    const { service, members, teams } = setup({ teams: [{ id: 't-sales', name: 'Sales ' }] });
    const { results } = await service.importMany(tenant, {
      rows: [row(), row({ email: 'omar@example.com', team: 'sales' }), row({ email: 'nour@example.com', team: 'Design' }), row({ email: 'karim@example.com', team: 'design' })],
      createCards: false,
      lang: 'en',
    });
    expect(results.map((r) => r.status)).toEqual(['invited', 'invited', 'invited', 'invited']);
    const teamIds = (members.invite.mock.calls as unknown as [unknown, { teamId?: string }][]).map((c) => c[1].teamId);
    expect(teamIds).toEqual(['t-sales', 't-sales', 't-new-1', 't-new-1']);
    expect(teams.create).toHaveBeenCalledTimes(1);
  });

  it('gives each person a card filled in from the row, with ways to reach them', async () => {
    const { service, cards, db } = setup();
    const { results } = await service.importMany(tenant, { rows: [row()], createCards: true, lang: 'ar' });
    expect(results[0]).toMatchObject({ status: 'invited', card: 'created' });
    expect(cards.create).toHaveBeenCalledWith(tenant, expect.objectContaining({ fullName: 'Mona Adel', title: 'Designer', ownerId: 'u-1', theme: expect.objectContaining({ lang: 'ar' }) }));
    expect(db.card.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { vcardData: { fullName: 'Mona Adel', email: 'mona@example.com', title: 'Designer', company: 'Vertex Build', phone: '+20 100 123 4567' } },
    }));
    const actions = (db.cardAction.createMany.mock.calls[0] as unknown as [{ data: { type: string }[] }])[0].data.map((a) => a.type);
    expect(actions).toEqual(['WHATSAPP', 'CALL', 'EMAIL']);
  });

  it('gives an Arabic name a card address from the email', async () => {
    const { service, cards } = setup();
    await service.importMany(tenant, { rows: [row({ name: 'سارة منصور', email: 'sara.mansour@x.com' })], createCards: true, lang: 'ar' });
    expect(cards.create).toHaveBeenCalledWith(tenant, expect.objectContaining({ slug: 'sara-mansour', fullName: 'سارة منصور' }));
    cards.create.mockClear();
    cards.create.mockRejectedValueOnce(new ConflictException('taken'));
    await service.importMany(tenant, { rows: [row({ name: 'سارة', email: 'sara@y.com' })], createCards: true, lang: 'ar' });
    expect(cards.create).toHaveBeenCalledTimes(2);
    expect((cards.create.mock.calls[1] as unknown as [unknown, { slug?: string }])[1].slug).toBeUndefined();
    expect(slugOf('a.')).toBeNull();
    expect(slugOf('Omar_Adel+work')).toBe('omar-adel-work');
  });

  it('leaves a card that already exists alone', async () => {
    const { service, cards } = setup({ cardOwners: ['u-1'] });
    const { results } = await service.importMany(tenant, { rows: [row()], createCards: true, lang: 'en' });
    expect(results[0]!.card).toBe('exists');
    expect(cards.create).not.toHaveBeenCalled();
  });

  it('skips a repeated email and keeps going past a row that fails', async () => {
    const invite = jest
      .fn()
      .mockResolvedValueOnce({ status: 'invited', email: 'a@x.com', emailSent: true })
      .mockRejectedValueOnce(new ForbiddenException('Your plan allows 5 members'))
      .mockRejectedValueOnce(new ConflictException('This user is already a member'))
      .mockResolvedValueOnce({ status: 'added', email: 'd@x.com', emailSent: true });
    const { service } = setup({ invite });
    const { results } = await service.importMany(tenant, {
      rows: [row({ email: 'a@x.com' }), row({ email: 'a@x.com' }), row({ email: 'b@x.com' }), row({ email: 'c@x.com' }), row({ email: 'd@x.com' })],
      createCards: false,
      lang: 'en',
    });
    expect(results.map((r) => r.status)).toEqual(['invited', 'duplicate', 'failed', 'member', 'added']);
    expect(results[2]!.reason).toBe('Your plan allows 5 members');
  });

  it('reports a card the plan will not allow without failing the invite', async () => {
    const { service, cards } = setup();
    cards.create.mockRejectedValueOnce(new ForbiddenException('Your plan allows 1 card'));
    const { results } = await service.importMany(tenant, { rows: [row()], createCards: true, lang: 'en' });
    expect(results[0]).toMatchObject({ status: 'invited', card: 'failed', reason: 'Your plan allows 1 card' });
  });

  it('stops at the plan’s seats without making teams for people who cannot join', async () => {
    const { service, members, teams } = setup({ seats: 1, held: ['again@x.com'] });
    const { results } = await service.importMany(tenant, {
      rows: [row({ email: 'a@x.com', team: 'Sales' }), row({ email: 'b@x.com', team: 'Design' }), row({ email: 'again@x.com', team: 'Sales' })],
      createCards: false,
      lang: 'en',
    });
    expect(results.map((r) => [r.status, r.code])).toEqual([['invited', undefined], ['failed', 'plan-limit'], ['invited', undefined]]);
    expect(teams.create).toHaveBeenCalledTimes(1);
    expect((members.invite.mock.calls as unknown as [unknown, { email: string }][]).map((c) => c[1].email)).toEqual(['a@x.com', 'again@x.com']);
  });

  it('keeps one audit entry for the whole import', async () => {
    const { service, audit } = setup();
    await service.importMany(tenant, { rows: [row(), row({ email: 'b@x.com' })], createCards: true, lang: 'en' });
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(tenant, 'members.imported', { metadata: { rows: 2, invited: 2, cards: 2 } });
  });
});
