import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ADMIN_ORG, getTenantContext } from '@vertex/db';
import { CardMoveService, mapStage, MOVE_OUT_ADMINS_ONLY, NOT_A_TARGET, OWNER_NOT_IN_TARGET } from './card-move.service';

/** Lazy, as Prisma's queries are: it runs, in whatever scope is current, only when awaited. */
function lazy<T>(run: () => T): PromiseLike<T> {
  return { then: (ok, fail) => Promise.resolve().then(run).then(ok, fail) };
}

const STAGES_FROM = [
  { id: 's_new', order: 0, isWon: false },
  { id: 's_talk', order: 1, isWon: false },
  { id: 's_offer', order: 3, isWon: false },
  { id: 's_won', order: 5, isWon: true },
];
const STAGES_TO = [
  { id: 't_new', order: 0, isWon: false },
  { id: 't_talk', order: 1, isWon: false },
  { id: 't_won', order: 2, isWon: true },
];

function setup(opts: { sourceKind?: 'PERSONAL' | 'TEAM'; role?: 'OWNER' | 'ADMIN' | 'EMPLOYEE'; cardOwner?: string; targetKind?: 'PERSONAL' | 'TEAM'; memberOfTarget?: boolean; ownerInTarget?: boolean } = {}) {
  const scopes: (string | undefined)[] = [];
  const at = <T>(v: T) => lazy(() => (scopes.push(getTenantContext()?.orgId), v));
  const writes: Record<string, unknown[]> = { lead: [], task: [], event: [], nfcTag: [], card: [], crm: [], presence: [] };
  const tx = {
    pipelineStage: { findMany: jest.fn(({ where }: { where: { orgId: string } }) => at(where.orgId === 'org_src' ? STAGES_FROM : STAGES_TO)) },
    membership: { findMany: jest.fn(() => at([{ userId: 'u_me' }, { userId: 'u_mate' }])) },
    lead: {
      findMany: jest.fn(() =>
        at([
          { id: 'l1', stageId: 's_offer', assignedTo: 'u_mate' },
          { id: 'l2', stageId: 's_won', assignedTo: 'u_gone' },
          { id: 'l3', stageId: null, assignedTo: null },
        ]),
      ),
      update: jest.fn((args: unknown) => at((writes.lead.push(args), {}))),
    },
    task: { updateMany: jest.fn((args: unknown) => at((writes.task.push(args), { count: 1 }))) },
    crmSyncRecord: { deleteMany: jest.fn((args: unknown) => at((writes.crm.push(args), { count: 1 }))) },
    event: { updateMany: jest.fn((args: unknown) => at((writes.event.push(args), { count: 4 }))) },
    nfcTag: { updateMany: jest.fn((args: unknown) => at((writes.nfcTag.push(args), { count: 2 }))) },
    cardPresence: { deleteMany: jest.fn((args: unknown) => at((writes.presence.push(args), { count: 0 }))) },
    card: { update: jest.fn((args: unknown) => at((writes.card.push(args), {}))) },
  };
  const db = {
    card: { findFirst: jest.fn(() => at({ id: 'card1', ownerId: opts.cardOwner ?? 'u_me', vcardData: { fullName: 'Mona Adel' }, slug: 'mona' })) },
    organization: { findUnique: jest.fn(() => at({ id: 'org_src', name: 'Source', kind: opts.sourceKind ?? 'PERSONAL' })) },
    membership: {
      findFirst: jest.fn(({ where }: { where: { userId: string } }) =>
        at(
          where.userId === 'u_me'
            ? opts.memberOfTarget === false
              ? null
              : { org: { id: 'org_dst', name: 'Nile Co', kind: opts.targetKind ?? 'TEAM' } }
            : opts.ownerInTarget === false
              ? null
              : { id: 'm_owner' },
        ),
      ),
      findMany: jest.fn(() => at([])),
    },
    lead: { count: jest.fn(() => at(3)) },
    nfcTag: { count: jest.fn(() => at(2)) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const limits = { assertWithin: jest.fn(async () => (scopes.push(`limit:${getTenantContext()?.orgId}`), undefined)) };
  const audit = { log: jest.fn(async () => undefined) };
  const notifications = { notifyOrgAdmins: jest.fn(async () => undefined) };
  const service = new CardMoveService({ client: db } as never, limits as never, audit as never, notifications as never);
  const tenant = { orgId: 'org_src', userId: 'u_me', role: opts.role ?? 'OWNER' } as const;
  return { service, tenant, db, tx, writes, scopes, limits, audit, notifications };
}

describe('where a lead’s stage lands', () => {
  it('keeps won as won, and otherwise the same place or the last one before it', () => {
    const by = (id: string) => STAGES_FROM.find((s) => s.id === id);
    expect(mapStage(by('s_won'), STAGES_TO)).toBe('t_won');
    expect(mapStage(by('s_talk'), STAGES_TO)).toBe('t_talk');
    expect(mapStage(by('s_offer'), STAGES_TO)).toBe('t_talk');
    expect(mapStage(undefined, STAGES_TO)).toBe('t_new');
    expect(mapStage(by('s_new'), [])).toBeNull();
  });
});

describe('moving a card into a company from one’s own workspace', () => {
  it('takes the card, its leads and its history; the chips stay behind', async () => {
    const { service, tenant, writes, limits, audit, notifications } = setup();
    await expect(service.move(tenant, 'card1', 'org_dst')).resolves.toEqual({ cardId: 'card1', orgId: 'org_dst', leads: 3, chips: 2 });

    expect(limits.assertWithin).toHaveBeenCalledWith('org_dst', 'cards', 1);
    expect(writes.card[0]).toEqual({ where: { id: 'card1' }, data: { orgId: 'org_dst' } });
    expect(writes.lead).toEqual([
      { where: { id: 'l1' }, data: { orgId: 'org_dst', stageId: 't_talk', tagId: null, assignedTo: 'u_mate' } },
      // Won stays won; someone not in the company hands it to the card's owner.
      { where: { id: 'l2' }, data: { orgId: 'org_dst', stageId: 't_won', tagId: null, assignedTo: 'u_me' } },
      { where: { id: 'l3' }, data: { orgId: 'org_dst', stageId: 't_new', tagId: null, assignedTo: 'u_me' } },
    ]);
    expect(writes.task[0]).toEqual({ where: { leadId: { in: ['l1', 'l2', 'l3'] }, orgId: 'org_src' }, data: { orgId: 'org_dst' } });
    expect(writes.event[0]).toEqual({ where: { cardId: 'card1', orgId: 'org_src' }, data: { orgId: 'org_dst', tagId: null } });
    expect(writes.nfcTag[0]).toEqual({ where: { cardId: 'card1' }, data: { cardId: null } });
    expect(writes.crm[0]).toMatchObject({ where: { orgId: 'org_src', entityId: { in: ['l1', 'l2', 'l3'] } } });

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_src' }), 'card.moved_out', expect.anything());
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_dst' }), 'card.moved_in', expect.anything());
    expect(notifications.notifyOrgAdmins).toHaveBeenCalledWith('org_dst', 'u_me', expect.objectContaining({ type: 'card.moved_in', body: 'Mona Adel' }));
  });

  it('does every write across workspaces, and checks the plan of the one it moves into', async () => {
    const { service, tenant, scopes } = setup();
    await service.move(tenant, 'card1', 'org_dst');
    const writes = scopes.filter((s) => s !== 'org_src' && s !== undefined);
    expect(writes).toContain('limit:org_dst');
    // Every query inside the move ran with no workspace filter on it.
    expect(scopes.slice(scopes.indexOf('limit:org_dst') + 1).every((s) => s === ADMIN_ORG)).toBe(true);
  });
});

describe('what a move is refused', () => {
  it('a member taking a card out of a company', async () => {
    const { service, tenant } = setup({ sourceKind: 'TEAM', role: 'EMPLOYEE' });
    await expect(service.move(tenant, 'card1', 'org_dst')).rejects.toThrow(new ForbiddenException(MOVE_OUT_ADMINS_ONLY));
  });

  it('a company admin may: the company decides', async () => {
    const { service, tenant } = setup({ sourceKind: 'TEAM', role: 'ADMIN' });
    await expect(service.move(tenant, 'card1', 'org_dst')).resolves.toMatchObject({ orgId: 'org_dst' });
  });

  it('somebody else’s card, for a member', async () => {
    const { service, tenant } = setup({ sourceKind: 'TEAM', role: 'EMPLOYEE', cardOwner: 'u_mate' });
    await expect(service.move(tenant, 'card1', 'org_dst')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a workspace the person is not in, or the one it is already in', async () => {
    const out = setup({ memberOfTarget: false });
    await expect(out.service.move(out.tenant, 'card1', 'org_dst')).rejects.toThrow(new BadRequestException(NOT_A_TARGET));
    const same = setup();
    await expect(same.service.move(same.tenant, 'card1', 'org_src')).rejects.toThrow(new BadRequestException(NOT_A_TARGET));
  });

  it('a workspace the card’s owner is not in', async () => {
    const { service, tenant, tx } = setup({ sourceKind: 'TEAM', role: 'ADMIN', cardOwner: 'u_mate', ownerInTarget: false });
    await expect(service.move(tenant, 'card1', 'org_dst')).rejects.toThrow(new BadRequestException(OWNER_NOT_IN_TARGET));
    expect(tx.card.update).not.toHaveBeenCalled();
  });

  it('one person’s own workspace into another’s', async () => {
    const { service, tenant } = setup({ targetKind: 'PERSONAL' });
    await expect(service.move(tenant, 'card1', 'org_dst')).rejects.toThrow(new BadRequestException(NOT_A_TARGET));
  });
});
