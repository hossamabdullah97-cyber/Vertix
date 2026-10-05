import { NotificationsService } from './notifications.service';

/** What waits in each workspace, for the workspace menu. */
describe('unread notifications by workspace', () => {
  it('counts each workspace’s unread, leaving out the ones about the person themselves', async () => {
    const groupBy = jest.fn(async () => [
      { orgId: 'org_nile', _count: { _all: 3 } },
      { orgId: 'org_own', _count: { _all: 1 } },
      { orgId: null, _count: { _all: 2 } },
    ]);
    const service = new NotificationsService({ client: { notification: { groupBy } } } as never);
    await expect(service.unreadByWorkspace('u1')).resolves.toEqual({ org_nile: 3, org_own: 1 });
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ['orgId'], where: { userId: 'u1', readAt: null, archivedAt: null } }));
  });
});
