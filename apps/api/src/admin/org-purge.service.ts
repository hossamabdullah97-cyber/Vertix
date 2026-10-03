import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService, uploadNamesIn } from '../uploads/storage.service';

/** How long a deleted workspace can still be restored before it is erased. */
export const PURGE_AFTER_DAYS = 30;
const DAY_MS = 86_400_000;
const SWEEP_MS = 6 * 60 * 60 * 1000;

/** When a workspace deleted at `deletedAt` is erased. */
export function purgeDate(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + PURGE_AFTER_DAYS * DAY_MS);
}

export interface PurgeReport {
  orgId: string;
  files: number;
  filesFailed: number;
  placeholders: number;
  visitors: number;
}

/**
 * Erases deleted workspaces for good, PURGE_AFTER_DAYS after their deletion:
 * what the privacy policy promises (/legal/privacy, "How long we keep it").
 *
 * Deleting a workspace only hides it (deletedAt), so it can be restored if
 * that was a mistake; every public surface already ignores it (LIVE_ORG).
 * After the window this removes:
 *   - the workspace and everything that hangs off it (cards, leads, chips'
 *     links, events, members' memberships, integrations…: the foreign keys
 *     cascade from the organization row);
 *   - the files its cards, leads and branding refer to, unless something
 *     that stays still refers to the same file;
 *   - invitations still pending for it, and the placeholder accounts of
 *     people invited who never signed up and belong nowhere else;
 *   - visitors (address, browser) seen only on its cards.
 * Members' own accounts stay: they are people, and may belong elsewhere.
 * Chips the workspace held go back to the platform's stock.
 */
@Injectable()
export class OrgPurgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrgPurgeService.name);
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const run = () => void this.sweep().catch((e) => this.logger.error(`purge sweep failed: ${(e as Error).message}`));
    // Soon after start-up, then every few hours: a server restarted daily
    // would otherwise never reach a long interval.
    this.first = setTimeout(run, 60_000);
    this.timer = setInterval(run, SWEEP_MS);
    this.first.unref?.();
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  /** Erases every workspace whose restore window has ended. */
  async sweep(now = new Date()): Promise<PurgeReport[]> {
    const due = await this.db.organization.findMany({
      where: { deletedAt: { not: null, lt: new Date(now.getTime() - PURGE_AFTER_DAYS * DAY_MS) } },
      select: { id: true },
    });
    const reports: PurgeReport[] = [];
    for (const { id } of due) {
      try {
        const r = await this.purge(id, now);
        if (r) reports.push(r);
      } catch (e) {
        this.logger.error(`Could not erase workspace ${id}: ${(e as Error).message}`);
      }
    }
    return reports;
  }

  /**
   * Erases one workspace, if it was deleted more than PURGE_AFTER_DAYS ago.
   * Anything else (a live workspace, one still in its window, one already
   * gone) is left alone and gives null: this is never the way to delete.
   */
  async purge(orgId: string, now = new Date()): Promise<PurgeReport | null> {
    const org = await this.db.organization.findFirst({
      where: { id: orgId, deletedAt: { not: null } },
      select: { id: true, deletedAt: true },
    });
    if (!org?.deletedAt || purgeDate(org.deletedAt) > now) return null;

    // Read before the rows that hold them go.
    const files = await this.filesOf(orgId);
    const visitors = await this.db.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT "visitorId" AS id FROM events WHERE "orgId" = ${orgId} AND "visitorId" IS NOT NULL`;
    const placeholders = await this.db.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM users u
      JOIN memberships m ON m."userId" = u.id AND m."orgId" = ${orgId}
      WHERE u."passwordHash" IS NULL AND u."googleId" IS NULL AND u."isSuperAdmin" = false
        AND NOT EXISTS (SELECT 1 FROM memberships o WHERE o."userId" = u.id AND o."orgId" <> ${orgId})`;

    const erased = await this.db.$transaction(async (tx) => {
      // Two servers sweeping at once: one erases, the other moves on.
      const [lock] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${'purge:' + orgId})) AS ok`;
      if (!lock?.ok) return false;

      await tx.nfcChip.updateMany({
        where: { claimedByOrgId: orgId, status: 'CLAIMED' },
        data: { status: 'AVAILABLE', claimedByOrgId: null, claimedAt: null },
      });
      await tx.nfcChip.updateMany({ where: { allocatedToOrgId: orgId }, data: { allocatedToOrgId: null } });
      await tx.token.deleteMany({ where: { orgId } });
      await tx.organization.delete({ where: { id: orgId } });
      if (placeholders.length) {
        await tx.user.deleteMany({ where: { id: { in: placeholders.map((p) => p.id) } } });
      }
      return true;
    });
    if (!erased) return null;

    const visitorIds = visitors.map((v) => v.id);
    const goneVisitors = visitorIds.length
      ? await this.db.$executeRaw`
          DELETE FROM visitors v WHERE v.id IN (${Prisma.join(visitorIds)})
            AND NOT EXISTS (SELECT 1 FROM events e WHERE e."visitorId" = v.id)`
      : 0;

    // Files last: the rows are gone either way, and a file another workspace
    // also uses (a copied template, a shared logo) is kept.
    let removed = 0;
    let failed = 0;
    for (const name of files) {
      if (await this.stillUsed(name)) continue;
      try {
        await this.storage.deleteUpload(name);
        removed++;
      } catch (e) {
        failed++;
        this.logger.warn(`Could not remove file ${name} of erased workspace ${orgId}: ${(e as Error).message}`);
      }
    }

    const report = { orgId, files: removed, filesFailed: failed, placeholders: placeholders.length, visitors: goneVisitors };
    this.logger.log(
      `Erased workspace ${orgId}, deleted ${org.deletedAt.toISOString()}: ${removed} files` +
        `${failed ? ` (${failed} could not be removed)` : ''}, ${placeholders.length} pending invitees, ${goneVisitors} visitors`,
    );
    return report;
  }

  /** Every stored file the workspace's rows refer to. */
  private async filesOf(orgId: string): Promise<string[]> {
    const rows = await this.db.$queryRaw<{ t: string | null }[]>`
      SELECT row_to_json(x)::text AS t FROM organizations x WHERE x.id = ${orgId}
      UNION ALL SELECT row_to_json(x)::text FROM cards x WHERE x."orgId" = ${orgId}
      UNION ALL SELECT row_to_json(x)::text FROM card_sections x JOIN cards c ON c.id = x."cardId" WHERE c."orgId" = ${orgId}
      UNION ALL SELECT row_to_json(x)::text FROM card_actions x JOIN cards c ON c.id = x."cardId" WHERE c."orgId" = ${orgId}
      UNION ALL SELECT row_to_json(x)::text FROM card_variants x JOIN cards c ON c.id = x."cardId" WHERE c."orgId" = ${orgId}
      UNION ALL SELECT row_to_json(x)::text FROM payment_links x JOIN cards c ON c.id = x."cardId" WHERE c."orgId" = ${orgId}
      UNION ALL SELECT row_to_json(x)::text FROM assets x WHERE x."orgId" = ${orgId}
      UNION ALL SELECT row_to_json(x)::text FROM leads x WHERE x."orgId" = ${orgId}
      UNION ALL SELECT row_to_json(x)::text FROM lead_activities x JOIN leads l ON l.id = x."leadId" WHERE l."orgId" = ${orgId}
      UNION ALL SELECT row_to_json(x)::text FROM occasions x WHERE x."orgId" = ${orgId}`;
    return uploadNamesIn(rows.map((r) => r.t ?? '').join('\n'));
  }

  /** Whether anything still in the database refers to this stored file. */
  private async stillUsed(name: string): Promise<boolean> {
    const like = `%/uploads/${name}%`;
    const [row] = await this.db.$queryRaw<{ used: boolean }[]>`
      SELECT (
        EXISTS (SELECT 1 FROM organizations x WHERE row_to_json(x)::text LIKE ${like})
        OR EXISTS (SELECT 1 FROM users x WHERE x."avatarUrl" LIKE ${like})
        OR EXISTS (SELECT 1 FROM cards x WHERE row_to_json(x)::text LIKE ${like})
        OR EXISTS (SELECT 1 FROM card_sections x WHERE row_to_json(x)::text LIKE ${like})
        OR EXISTS (SELECT 1 FROM card_actions x WHERE row_to_json(x)::text LIKE ${like})
        OR EXISTS (SELECT 1 FROM card_variants x WHERE row_to_json(x)::text LIKE ${like})
        OR EXISTS (SELECT 1 FROM payment_links x WHERE row_to_json(x)::text LIKE ${like})
        OR EXISTS (SELECT 1 FROM assets x WHERE x.url LIKE ${like})
        OR EXISTS (SELECT 1 FROM leads x WHERE row_to_json(x)::text LIKE ${like})
        OR EXISTS (SELECT 1 FROM lead_activities x WHERE row_to_json(x)::text LIKE ${like})
        OR EXISTS (SELECT 1 FROM occasions x WHERE row_to_json(x)::text LIKE ${like})
      ) AS used`;
    return !!row?.used;
  }
}
