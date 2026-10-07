import { AnalyticsService, RETURN_ALERT_MS } from './analytics.service';

const NOW = new Date('2026-10-07T12:00:00Z');

function make(leads: { id: string; createdAt: Date; assignedTo: string | null }[], claimed = 1) {
  const db = {
    lead: {
      findMany: jest.fn(async () => leads.map((l) => ({ name: 'Mona', company: 'Acme', cardId: 'c1', ...l }))),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: claimed })),
    },
  };
  const notifications = { notify: jest.fn(async () => undefined) };
  const service = new AnalyticsService({ client: db } as never, {} as never, notifications as never);
  return { service, db, notifications };
}

const card = { orgId: 'o1', ownerId: 'owner' };

describe('a lead coming back to the card', () => {
  it('is remembered on the lead and told to whoever looks after it', async () => {
    const { service, db, notifications } = make([{ id: 'l1', createdAt: new Date(NOW.getTime() - 86_400_000), assignedTo: 'sara' }]);
    await service.noteReturn(card, 'v1', NOW);
    expect(db.lead.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { lastVisitAt: NOW } });
    expect(db.lead.updateMany).toHaveBeenCalledWith({
      where: { id: 'l1', OR: [{ returnAlertAt: null }, { returnAlertAt: { lt: new Date(NOW.getTime() - RETURN_ALERT_MS) } }] },
      data: { returnAlertAt: NOW },
    });
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'sara', orgId: 'o1', type: 'lead.returned', metadata: { leadId: 'l1', name: 'Mona', company: 'Acme' } }));
  });

  it('goes to the card owner when nobody is assigned', async () => {
    const { service, notifications } = make([{ id: 'l1', createdAt: new Date(NOW.getTime() - 86_400_000), assignedTo: null }]);
    await service.noteReturn(card, 'v1', NOW);
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner' }));
  });

  it('is not the visit they left their details on', async () => {
    const { service, db, notifications } = make([{ id: 'l1', createdAt: new Date(NOW.getTime() - 60_000), assignedTo: 'sara' }]);
    await service.noteReturn(card, 'v1', NOW);
    expect(db.lead.update).toHaveBeenCalled();
    expect(db.lead.updateMany).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('is told at most twice a day', async () => {
    const { service, notifications } = make([{ id: 'l1', createdAt: new Date(NOW.getTime() - 86_400_000), assignedTo: 'sara' }], 0);
    await service.noteReturn(card, 'v1', NOW);
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
