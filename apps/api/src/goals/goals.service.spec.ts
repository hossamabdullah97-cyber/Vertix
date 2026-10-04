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
    },
  };
  const analytics = {
    memberPerformance: jest.fn().mockResolvedValue([
      { user: person('u1'), leads: 4, scans: 10 },
      { user: person('u2'), leads: 5, scans: 2 },
    ]),
  };
  const config = { get: () => 'Africa/Cairo' };
  return { service: new GoalsService(prisma as never, analytics as never, config as never), prisma };
}

const goal = (o: Record<string, unknown>) => ({ id: 'g', metric: 'LEADS', period: 'WEEK', scope: 'TEAM', userId: null, target: 20, user: null, ...o });

describe('GoalsService', () => {
  it('counts the team total, each member, and one member', async () => {
    const { service } = make([goal({ id: 't' }), goal({ id: 'e', scope: 'EACH', target: 5 }), goal({ id: 'm', scope: 'MEMBER', userId: 'u2', user: person('u2') })]);
    const { goals, canEdit } = await service.list({ orgId: 'o', userId: 'u1', role: 'MANAGER' });
    expect(canEdit).toBe(true);
    expect(goals.find((g) => g.id === 't')).toMatchObject({ value: 9 });
    expect(goals.find((g) => g.id === 'e')!.members!.map((m) => m.value)).toEqual([4, 5]);
    expect(goals.find((g) => g.id === 'm')).toMatchObject({ value: 5 });
  });

  it("shows a member the team's goals and their own line, not a colleague's", async () => {
    const { service } = make([goal({ id: 'e', scope: 'EACH' }), goal({ id: 'm', scope: 'MEMBER', userId: 'u2', user: person('u2') })]);
    const { goals, canEdit } = await service.list({ orgId: 'o', userId: 'u1', role: 'EMPLOYEE' });
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
});
