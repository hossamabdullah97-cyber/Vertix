import { OnboardingService, hasLinks } from './onboarding.service';

type Opts = {
  state?: Record<string, string> | null;
  cards?: unknown[];
  views?: number;
  leads?: number;
  chips?: number;
  kind?: 'PERSONAL' | 'TEAM';
  others?: number;
  alerts?: boolean;
};

const fullCard = {
  id: 'c1',
  ownerId: 'u1',
  isPublished: true,
  vcardData: { avatar: 'https://x/a.png', phone: '+20100' },
  actions: [{ isActive: true }],
  sections: [],
};

function setup(o: Opts = {}) {
  const db = {
    user: { findUnique: jest.fn(async () => ({ onboarding: o.state ?? null })), update: jest.fn(async () => ({})) },
    leadAlertSettings: { findUnique: jest.fn(async () => (o.alerts ? { userId: 'u1' } : null)) },
    card: { findMany: jest.fn(async () => o.cards ?? []) },
    event: { count: jest.fn(async () => o.views ?? 0) },
    lead: { count: jest.fn(async () => o.leads ?? 0) },
    nfcTag: { count: jest.fn(async () => o.chips ?? 0) },
    organization: { findUnique: jest.fn(async () => ({ kind: o.kind ?? 'TEAM' })) },
    membership: { count: jest.fn(async () => o.others ?? 0) },
  };
  const service = new OnboardingService({ client: db } as never);
  return { service, db };
}

const owner = { orgId: 'org1', userId: 'u1', role: 'OWNER' } as const;

describe('getting started', () => {
  it('starts at the beginning for a new account, the card to make first', async () => {
    const { service } = setup();
    const v = await service.view('u1', owner);
    expect(v.steps.map((s) => [s.id, s.done])).toEqual([
      ['createCard', false],
      ['addPhoto', false],
      ['addContact', false],
      ['publishCard', false],
      ['shareCard', false],
      ['firstLead', false],
      ['leadAlerts', false],
      ['inviteTeam', false],
      ['linkTag', false],
    ]);
    expect(v).toMatchObject({ done: 0, total: 9, welcomed: false, dismissed: false, completedAt: null, justCompleted: false, workspaceKind: 'TEAM' });
    expect(v.steps[0]!.href).toBe('/cards?new=1');
  });

  it('ticks each step off from what the person has, and sends them to their own card', async () => {
    const { service } = setup({ cards: [{ ...fullCard, id: 'c_other', ownerId: 'u2' }, fullCard], views: 3, leads: 1 });
    const v = await service.view('u1', owner);
    expect(v.steps.filter((s) => s.done).map((s) => s.id)).toEqual(['createCard', 'addPhoto', 'addContact', 'publishCard', 'shareCard', 'firstLead']);
    expect(v.steps.find((s) => s.id === 'shareCard')!.href).toBe('/cards/c1?share=1');
  });

  it('asks a person’s own workspace, and a member, nothing about inviting a team', async () => {
    const personal = setup({ kind: 'PERSONAL' });
    expect((await personal.service.view('u1', owner)).steps.map((s) => s.id)).not.toContain('inviteTeam');
    const member = setup();
    expect((await member.service.view('u1', { ...owner, role: 'EMPLOYEE' })).steps.map((s) => s.id)).not.toContain('inviteTeam');
  });

  it('is finished once, and says so only that once', async () => {
    const all = { cards: [fullCard], views: 1, leads: 1, chips: 1, others: 1, alerts: true };
    const first = setup(all);
    const v = await first.service.view('u1', owner);
    expect(v).toMatchObject({ done: 9, justCompleted: true, completedAt: expect.any(String) });
    expect(first.db.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { onboarding: { completedAt: expect.any(String) } } });
    const again = setup({ ...all, state: { completedAt: '2026-10-01T00:00:00.000Z' } });
    expect(await again.service.view('u1', owner)).toMatchObject({ justCompleted: false, completedAt: '2026-10-01T00:00:00.000Z' });
  });

  it('remembers the welcome and hiding, on the person, and can be brought back', async () => {
    const { service, db } = setup({ state: { dismissedAt: '2026-10-01T00:00:00.000Z' } });
    await service.update('u1', { welcomed: true, dismissed: false }, owner);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { onboarding: { welcomedAt: expect.any(String) } } });
  });

  it('in no workspace, only asks how to hear about leads', async () => {
    const { service } = setup();
    const v = await service.view('u1');
    expect(v.steps.map((s) => s.id)).toEqual(['leadAlerts']);
    expect(v.workspaceKind).toBeNull();
  });

  it('counts a link as an action or a social link that is shown', () => {
    expect(hasLinks({ actions: [{ isActive: false }], sections: [{ type: 'SOCIAL', isVisible: true, content: { links: [{ url: 'x' }] } }] })).toBe(true);
    expect(hasLinks({ actions: [], sections: [{ type: 'SOCIAL', isVisible: false, content: { links: [{ url: 'x' }] } }] })).toBe(false);
  });
});
