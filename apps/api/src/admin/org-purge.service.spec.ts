import { OrgPurgeService, PURGE_AFTER_DAYS, purgeDate } from './org-purge.service';
import { uploadNamesIn } from '../uploads/storage.service';

const DAY = 86_400_000;
const NOW = new Date('2026-11-01T00:00:00Z');

function setup(org: { id: string; deletedAt: Date | null } | null) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ ok: true }]),
    nfcChip: { updateMany: jest.fn() },
    token: { deleteMany: jest.fn() },
    organization: { delete: jest.fn() },
    user: { deleteMany: jest.fn() },
  };
  const db = {
    organization: {
      findFirst: jest.fn().mockResolvedValue(org && org.deletedAt ? org : null),
      findMany: jest.fn().mockResolvedValue(org ? [{ id: org.id }] : []),
    },
    // filesOf, visitors, placeholders, then stillUsed for each file
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([{ t: '{"photo":"https://media.test/uploads/a1.jpg","logo":"/uploads/b2.png"}' }])
      .mockResolvedValueOnce([{ id: 'vis1' }])
      .mockResolvedValueOnce([{ id: 'invitee1' }])
      .mockResolvedValueOnce([{ used: false }])
      .mockResolvedValueOnce([{ used: true }]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const storage = { deleteUpload: jest.fn().mockResolvedValue(undefined) };
  const service = new OrgPurgeService({ client: db } as never, storage as never);
  return { service, db, tx, storage };
}

describe('OrgPurgeService', () => {
  it('erases a workspace deleted more than the window ago, and only its unshared files', async () => {
    const { service, tx, storage } = setup({ id: 'org1', deletedAt: new Date(NOW.getTime() - (PURGE_AFTER_DAYS + 1) * DAY) });
    const report = await service.purge('org1', NOW);
    expect(tx.organization.delete).toHaveBeenCalledWith({ where: { id: 'org1' } });
    expect(tx.nfcChip.updateMany).toHaveBeenCalledWith({
      where: { claimedByOrgId: 'org1', status: 'CLAIMED' },
      data: { status: 'AVAILABLE', claimedByOrgId: null, claimedAt: null },
    });
    expect(tx.token.deleteMany).toHaveBeenCalledWith({ where: { orgId: 'org1' } });
    expect(tx.user.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['invitee1'] } } });
    // a1.jpg is used by nothing else; b2.png is still used elsewhere.
    expect(storage.deleteUpload).toHaveBeenCalledTimes(1);
    expect(storage.deleteUpload).toHaveBeenCalledWith('a1.jpg');
    expect(report).toEqual({ orgId: 'org1', files: 1, filesFailed: 0, placeholders: 1, visitors: 1 });
  });

  it('never erases a workspace still inside its restore window', async () => {
    const { service, tx, storage } = setup({ id: 'org1', deletedAt: new Date(NOW.getTime() - 5 * DAY) });
    await expect(service.purge('org1', NOW)).resolves.toBeNull();
    expect(tx.organization.delete).not.toHaveBeenCalled();
    expect(storage.deleteUpload).not.toHaveBeenCalled();
  });

  it('never erases a workspace that was not deleted', async () => {
    const { service, tx, db } = setup({ id: 'org1', deletedAt: null });
    await expect(service.purge('org1', NOW)).resolves.toBeNull();
    expect(db.organization.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'org1', deletedAt: { not: null } } }));
    expect(tx.organization.delete).not.toHaveBeenCalled();
  });

  it('steps aside when another server is already erasing it', async () => {
    const { service, tx, storage } = setup({ id: 'org1', deletedAt: new Date(NOW.getTime() - 40 * DAY) });
    tx.$queryRaw.mockResolvedValueOnce([{ ok: false }]);
    await expect(service.purge('org1', NOW)).resolves.toBeNull();
    expect(tx.organization.delete).not.toHaveBeenCalled();
    expect(storage.deleteUpload).not.toHaveBeenCalled();
  });

  it('sweeps only workspaces deleted before the window', async () => {
    const { service, db } = setup(null);
    await service.sweep(NOW);
    expect(db.organization.findMany).toHaveBeenCalledWith({
      where: { deletedAt: { not: null, lt: new Date(NOW.getTime() - PURGE_AFTER_DAYS * DAY) } },
      select: { id: true },
    });
  });

  it('dates erasure the window after deletion', () => {
    expect(purgeDate(new Date('2026-10-01T10:00:00Z')).toISOString()).toBe('2026-10-31T10:00:00.000Z');
  });
});

describe('uploadNamesIn', () => {
  it('finds stored files in bucket and local addresses, once each', () => {
    expect(uploadNamesIn('a https://media.x/uploads/ab-1.jpg b http://api/uploads/ab-1.jpg c /uploads/cd.webp /other/x.png')).toEqual(['ab-1.jpg', 'cd.webp']);
  });
});
