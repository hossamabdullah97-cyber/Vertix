import { ForbiddenException } from '@nestjs/common';
import { PLAN_LIMITS } from '@vertex/shared';
import { LimitsService } from './limits.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Plan limits are the paywall. A leak here gives away paid capacity; a false
 * positive blocks a paying customer from using what they bought. Both matter,
 * so the boundary cases are asserted from each side.
 */

function makeService(plan: string, counts: { cards?: number; members?: number; nfcTags?: number } = {}) {
  const prisma = {
    client: {
      organization: { findUnique: jest.fn().mockResolvedValue({ plan }) },
      card: { count: jest.fn().mockResolvedValue(counts.cards ?? 0) },
      membership: { count: jest.fn().mockResolvedValue(counts.members ?? 0) },
      nfcTag: { count: jest.fn().mockResolvedValue(counts.nfcTags ?? 0) },
      subscription: { findFirst: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    },
  } as unknown as PrismaService;
  return new LimitsService(prisma);
}

describe('LimitsService.assertWithin', () => {
  it('allows an addition that lands exactly on the limit', () => {
    // FREE allows 1 card; going from 0 to 1 is the whole point of the tier.
    const svc = makeService('FREE', { cards: 0 });
    return expect(svc.assertWithin('org', 'cards', 1)).resolves.toBeUndefined();
  });

  it('rejects the addition that would cross the limit', async () => {
    const svc = makeService('FREE', { cards: 1 });
    await expect(svc.assertWithin('org', 'cards', 1)).rejects.toThrow(ForbiddenException);
  });

  it('counts the whole batch, not just one row', async () => {
    // PRO allows 5 cards. At 3, adding 3 must fail even though adding 1 passes.
    const svc = makeService('PRO', { cards: 3 });
    await expect(svc.assertWithin('org', 'cards', 1)).resolves.toBeUndefined();
    await expect(svc.assertWithin('org', 'cards', 3)).rejects.toThrow(ForbiddenException);
  });

  it('names the plan and the limit so the error is actionable', async () => {
    const svc = makeService('FREE', { cards: 1 });
    await expect(svc.assertWithin('org', 'cards', 1)).rejects.toThrow(/Free.*1 cards/i);
  });

  it('treats a null limit as unlimited and skips counting entirely', async () => {
    const svc = makeService('ENTERPRISE', { cards: 10_000 });
    await expect(svc.assertWithin('org', 'cards', 5_000)).resolves.toBeUndefined();
    expect(PLAN_LIMITS.ENTERPRISE.cards).toBeNull();
  });

  it('falls back to FREE for an unknown or missing organization', async () => {
    // Failing open here would hand out unlimited capacity to a bad orgId.
    const prisma = {
      client: {
        organization: { findUnique: jest.fn().mockResolvedValue(null) },
        card: { count: jest.fn().mockResolvedValue(1) },
        membership: { count: jest.fn() },
        nfcTag: { count: jest.fn() },
        subscription: { findFirst: jest.fn() },
      },
    } as unknown as PrismaService;
    await expect(
      new LimitsService(prisma).assertWithin('ghost', 'cards', 1),
    ).rejects.toThrow(ForbiddenException);
  });

  it('checks each resource against its own limit', async () => {
    // PRO: 5 cards / 5 members / 50 tags — a full card quota must not block tags.
    const svc = makeService('PRO', { cards: 5, members: 1, nfcTags: 1 });
    await expect(svc.assertWithin('org', 'cards', 1)).rejects.toThrow(ForbiddenException);
    await expect(svc.assertWithin('org', 'nfcTags', 1)).resolves.toBeUndefined();
    await expect(svc.assertWithin('org', 'members', 1)).resolves.toBeUndefined();
  });

  it('gives a higher plan more room for the same usage', async () => {
    const usage = { cards: 4 };
    await expect(
      makeService('FREE', usage).assertWithin('org', 'cards', 1),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      makeService('BUSINESS', usage).assertWithin('org', 'cards', 1),
    ).resolves.toBeUndefined();
  });
});

describe('LimitsService.usage', () => {
  it('reports the plan, its limits and real counts together', async () => {
    const svc = makeService('PRO', { cards: 2, members: 3, nfcTags: 7 });
    await expect(svc.usage('org')).resolves.toEqual({
      plan: 'PRO',
      limits: PLAN_LIMITS.PRO,
      usage: { cards: 2, members: 3, nfcTags: 7 },
      status: 'ACTIVE',
    });
  });

  it('reports NONE when the org has never subscribed', async () => {
    const prisma = {
      client: {
        organization: { findUnique: jest.fn().mockResolvedValue({ plan: 'FREE' }) },
        card: { count: jest.fn().mockResolvedValue(0) },
        membership: { count: jest.fn().mockResolvedValue(1) },
        nfcTag: { count: jest.fn().mockResolvedValue(0) },
        subscription: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    } as unknown as PrismaService;
    const out = await new LimitsService(prisma).usage('org');
    expect(out.status).toBe('NONE');
  });
});
