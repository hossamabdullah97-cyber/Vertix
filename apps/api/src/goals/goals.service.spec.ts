import { ForbiddenException } from '@nestjs/common';
import { GoalsService } from './goals.service';

const person = (id: string) => ({ id, name: id, email: `${id}@x.com`, avatarUrl: null });

function make(goals: Record<string, unknown>[]) {
  const prisma = {
    client: {
      goal: {
        findMany: jest.fn().mockResolvedValue(goals),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (a: { data: unknown }) => a.data),
        update: jest.fn(async (a: { data: unknown }) => a.data),
      },
      membership: {
        findMany: jest.fn().mockResolvedValue([{ user: person('u1') }, { user: person('u2') }]),
        findFirst: jest.fn().mockResolvedValue({ id: 'm' }),
      },
      lead: { count: jest.fn().mockResolvedValue(9) },
      event: { count: jest.fn().mockResolvedValue(0) },
      // The achievement claim: the first time it is new, then it is not.
      $executeRaw: jest.fn().mockResolvedValueOnce(1).mockResolvedValue(0),
    },
  };
  const analytics = {
    memberPerformance: jest.fn().mockResolvedValue([
      { user: person('u1'), leads: 4, scans: 10 },
      { user: person('u2'), leads: 5, scans: 2 },
    ]),
  };
  const config = { get: () => 'Africa/Cairo' };
  const notifications = { notify: jest.fn(), notifyMany: jest.fn() };
  return { service: new GoalsService(prisma as never, analytics as never, config as never, notifications as never), prisma, notifications };
}

const goal = (o: Record<string, unknown>) => ({ id: 'g', metric: 'LEADS', period: 'WEEK', scope: 'TEAM', userId: null, target: 20, user: null, ...o });

describe('GoalsService', () => {
  it('counts the team total, each member, and one member', async () => {
    const { service } = make([goal({ id: 't' }), goal({ id: 'e', scope: 'EACH', target: 5 }), goal({ id: 'm', scope: 'MEMBER', userId: 'u2', user: person('u2') })]);
    const { goals, canEdit } = await service.list({ orgId: 'o', userId: 'u1', role: 'MANAGER' }, new Date(), false);
    expect(canEdit).toBe(true);
    expect(goals.find((g) => g.id === 't')).toMatchObject({ value: 9 });
    expect(goals.find((g) => g.id === 'e')!.members!.map((m) => m.value)).toEqual([4, 5]);
    expect(goals.find((g) => g.id === 'm')).toMatchObject({ value: 5 });
  });

  it("shows a member the team's goals and their own line, not a colleague's", async () => {
    const { service } = make([goal({ id: 'e', scope: 'EACH' }), goal({ id: 'm', scope: 'MEMBER', userId: 'u2', user: person('u2') })]);
    const { goals, canEdit } = await service.list({ orgId: 'o', userId: 'u1', role: 'EMPLOYEE' }, new Date(), false);
    expect(canEdit).toBe(false);
    expect(goals.map((g) => g.id)).toEqual(['e']);
    expect(goals[0]!.members!.map((m) => m.user.id)).toEqual(['u1']);
  });

  it('changes the target of an existing goal instead of adding another, and only for the team leads', async () => {
    const { service, prisma } = make([]);
    prisma.client.goal.findFirst.mockResolvedValue({ id: 'g1' });
    await service.set({ orgId: 'o', userId: 'u1', role: 'ADMIN' }, { metric: 'LEADS', period: 'WEEK', scope: 'TEAM', target: 30 });
    expect(prisma.client.goal.update).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { target: 30 } });
    expect(prisma.client.goal.create).not.toHaveBeenCalled();
    await expect(service.set({ orgId: 'o', userId: 'u1', role: 'EMPLOYEE' }, { metric: 'LEADS', period: 'WEEK', scope: 'TEAM', target: 30 })).rejects.toThrow(ForbiddenException);
  });

  it('celebrates a reached team goal once, with everyone', async () => {
    const { service, notifications, prisma } = make([goal({ id: 't', target: 9 })]);
    prisma.client.membership.findMany.mockResolvedValue([
      { user: person('u1'), userId: 'u1', role: 'OWNER' },
      { user: person('u2'), userId: 'u2', role: 'EMPLOYEE' },
    ]);
    await expect(service.celebrate('o')).resolves.toBe(1);
    expect(notifications.notifyMany).toHaveBeenCalledWith(['u1', 'u2'], expect.objectContaining({ type: 'goal.team_reached', body: 'New leads this week: 9 of 9' }));
    await expect(service.celebrate('o')).resolves.toBe(0);
    expect(notifications.notifyMany).toHaveBeenCalledTimes(1);
  });

  it("tells a member they reached their own goal, and the team's leads", async () => {
    const { service, notifications, prisma } = make([goal({ id: 'e', scope: 'EACH', target: 5 })]);
    prisma.client.membership.findMany.mockResolvedValue([
      { user: person('u1'), userId: 'u1', role: 'MANAGER' },
      { user: person('u2'), userId: 'u2', role: 'EMPLOYEE' },
    ]);
    await expect(service.celebrate('o')).resolves.toBe(1);
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u2', type: 'goal.you_reached' }));
    expect(notifications.notifyMany).toHaveBeenCalledWith(['u1'], expect.objectContaining({ type: 'goal.member_reached', title: 'u2 reached their goal' }));
  });
});
