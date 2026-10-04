import { FollowUpService, hourIn } from './follow-up.service';

// 12:00 in Cairo (UTC+3 in October), well inside the day.
const NOON = new Date('2026-10-04T09:00:00Z');
// 23:30 in Cairo.
const NIGHT = new Date('2026-10-04T20:30:00Z');

function setup(leads: Record<string, unknown>[], claim = 1) {
  const db = {
    lead: {
      findMany: jest.fn().mockResolvedValue(leads),
      updateMany: jest.fn().mockResolvedValue({ count: claim }),
    },
  };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  const service = new FollowUpService({ client: db } as never, notifications as never, { get: () => 'Africa/Cairo' } as never);
  return { service, db, notifications };
}

const lead = (over: Record<string, unknown> = {}) => ({
  id: 'L1',
  orgId: 'o1',
  name: 'Mona Adel',
  company: 'Acme',
  createdAt: new Date(NOON.getTime() - 26 * 3_600_000),
  assignedTo: null,
  followUpReminders: 0,
  card: { ownerId: 'owner1' },
  ...over,
});

describe('FollowUpService', () => {
  it('knows the hour in the workspace time zone', () => {
    expect(hourIn('Africa/Cairo', NOON)).toBe(12);
    expect(hourIn('Africa/Cairo', NIGHT)).toBe(23);
  });

  it('stays quiet at night', async () => {
    const { service, db } = setup([lead()]);
    await expect(service.sweep(NIGHT)).resolves.toBe(0);
    expect(db.lead.findMany).not.toHaveBeenCalled();
  });

  it('reminds the card owner about a lead nobody reached, and counts the reminder', async () => {
    const { service, db, notifications } = setup([lead()]);
    await expect(service.sweep(NOON)).resolves.toBe(1);
    const where = db.lead.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ firstContactedAt: null, org: { deletedAt: null } });
    expect(db.lead.updateMany).toHaveBeenCalledWith({
      where: { id: 'L1', followUpReminders: 0, firstContactedAt: null },
      data: { followUpReminders: 1, followUpRemindedAt: NOON },
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner1', type: 'lead.follow_up', priority: 'HIGH', metadata: expect.objectContaining({ leadId: 'L1', waitingHours: 26, reminder: 1 }) }),
    );
  });

  it('reminds the person the lead is assigned to, when there is one', async () => {
    const { service, notifications } = setup([lead({ assignedTo: 'rep1' })]);
    await service.sweep(NOON);
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'rep1' }));
  });

  it('does not remind twice when another server got there first', async () => {
    const { service, notifications } = setup([lead()], 0);
    await expect(service.sweep(NOON)).resolves.toBe(0);
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
