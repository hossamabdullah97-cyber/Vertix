import { ForbiddenException } from '@nestjs/common';
import { TagsService } from './tags.service';

/** A tag service over an in-memory stand-in for the queries removal makes. */
function setup(kind: 'PERSONAL' | 'TEAM') {
  const tag = { id: 'tag1', orgId: 'org1', uid: '04:A1:B2:C3', activationCount: 3 };
  const db = {
    nfcTag: { findFirst: jest.fn().mockResolvedValue(tag), delete: jest.fn().mockResolvedValue(tag) },
    organization: { findUnique: jest.fn().mockResolvedValue({ kind }) },
    nfcChip: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const tags = new TagsService({ client: db } as never, {} as never);
  return { tags, db };
}

const owner = { orgId: 'org1', userId: 'u1', role: 'OWNER' } as const;

describe('TagsService.remove', () => {
  it('lets a personal account remove a chip that was tapped, and frees it for any account', async () => {
    const { tags, db } = setup('PERSONAL');
    await expect(tags.remove(owner, 'tag1')).resolves.toEqual({ id: 'tag1', deleted: true, freed: true });
    expect(db.nfcTag.delete).toHaveBeenCalledWith({ where: { id: 'tag1' } });
    // Back in the registry, not deleted from it, and no longer reserved.
    expect(db.nfcChip.updateMany).toHaveBeenCalledWith({
      where: { uid: '04:A1:B2:C3', status: 'CLAIMED' },
      data: { status: 'AVAILABLE', claimedByOrgId: null, claimedAt: null, allocatedToOrgId: null },
    });
  });

  it('keeps a team’s chip with the team, so its owner can add it again for any member', async () => {
    const { tags, db } = setup('TEAM');
    await expect(tags.remove(owner, 'tag1')).resolves.toMatchObject({ freed: false });
    expect(db.nfcChip.updateMany.mock.calls[0][0].data.allocatedToOrgId).toBe('org1');
  });

  it.each(['ADMIN', 'MANAGER', 'EMPLOYEE'] as const)('refuses a %s, saying only the owner can', async (role) => {
    const { tags, db } = setup('TEAM');
    const r = tags.remove({ ...owner, role }, 'tag1');
    await expect(r).rejects.toBeInstanceOf(ForbiddenException);
    await expect(tags.remove({ ...owner, role }, 'tag1')).rejects.toThrow(/owner/);
    expect(db.nfcTag.delete).not.toHaveBeenCalled();
    expect(db.nfcChip.updateMany).not.toHaveBeenCalled();
  });
});
