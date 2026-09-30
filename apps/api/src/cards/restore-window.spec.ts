import { applyScope } from '@vertex/db';
import { RESTORE_WINDOW_MS, recentlyDeleted } from './restore-window';

describe('restoring a deleted card, link, section or payment link', () => {
  const tenant = { orgId: 'org_1', userId: 'u1', role: 'OWNER' } as never;

  it('reaches rows deleted within the window, which reads otherwise hide', () => {
    const now = Date.parse('2026-09-30T10:00:00Z');
    const where = { id: 'c1', ...recentlyDeleted(now) };
    const scoped = applyScope('Card', 'findFirst', { where }, tenant);
    // The caller's deletedAt wins over the default "not deleted", and the workspace is still enforced.
    expect(scoped.where).toEqual({ deletedAt: { gte: new Date(now - RESTORE_WINDOW_MS) }, id: 'c1', orgId: 'org_1' });
  });

  it('still hides deleted rows from every other read', () => {
    expect(applyScope('Card', 'findFirst', { where: { id: 'c1' } }, tenant).where).toEqual({ deletedAt: null, id: 'c1', orgId: 'org_1' });
  });
});
