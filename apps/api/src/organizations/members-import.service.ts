import { ConflictException, ForbiddenException, HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma, type TenantContext } from '@vertex/db';
import type { ImportMembersInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MembersService } from './members.service';
import { TeamsService } from './teams.service';
import { CardsService } from '../cards/cards.service';
import { AuditService } from './audit.service';
import { LimitsService } from '../billing/limits.service';

export type ImportOutcome = 'invited' | 'added' | 'member' | 'duplicate' | 'failed';
export type CardOutcome = 'created' | 'exists' | 'failed' | 'skipped';

export interface ImportResult {
  row: number;
  email: string;
  status: ImportOutcome;
  card: CardOutcome;
  /** Why a row or its card did not go through, in plain words. */
  reason?: string;
  /** Set when the plan is what stopped it, so the page can say so in its language. */
  code?: 'plan-limit';
  emailSent?: boolean;
}

/** A card address from an email's first half, or null when too short. */
export function slugOf(s: string): string | null {
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return slug.length >= 3 ? slug : null;
}

/** A person's phone as WhatsApp takes it: digits only. */
const digits = (s: string) => s.replace(/[^\d]/g, '');

/**
 * Brings a whole team in from a spreadsheet: each row is invited (or added,
 * when the person already has an account), put on its team (made when it
 * does not exist yet), and, if asked, given a card filled in from the row.
 * Rows are independent, so one bad row never stops the rest; the result says
 * what happened to each.
 */
@Injectable()
export class MembersImportService {
  private readonly logger = new Logger(MembersImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
    private readonly teams: TeamsService,
    private readonly cards: CardsService,
    private readonly audit: AuditService,
    private readonly limits: LimitsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async importMany(tenant: TenantContext, input: ImportMembersInput): Promise<{ results: ImportResult[] }> {
    const org = await this.db.organization.findUnique({ where: { id: tenant.orgId }, select: { name: true } });

    // Teams by name, ignoring case; the ones the sheet names but the org does
    // not have yet are made once, the first time they come up.
    const existingTeams = await this.db.team.findMany({ select: { id: true, name: true } });
    const teamIds = new Map(existingTeams.map((t) => [t.name.trim().toLowerCase(), t.id]));
    const teamFor = async (name?: string) => {
      const key = name?.trim().toLowerCase();
      if (!key) return undefined;
      let id = teamIds.get(key);
      if (!id) {
        id = (await this.teams.create(tenant, { name: name!.trim() })).id;
        teamIds.set(key, id);
      }
      return id;
    };

    const seen = new Set<string>();
    const results: ImportResult[] = [];

    for (const [i, row] of input.rows.entries()) {
      const r: ImportResult = { row: i + 1, email: row.email, status: 'failed', card: 'skipped' };
      results.push(r);
      if (seen.has(row.email)) {
        r.status = 'duplicate';
        r.reason = 'Appears earlier in the file';
        continue;
      }
      seen.add(row.email);

      try {
        // A new person needs a seat; check before making their team, so a
        // full plan leaves no empty teams behind. Someone already invited
        // keeps the seat they have.
        const held = await this.db.membership.findFirst({
          where: { user: { email: { equals: row.email, mode: 'insensitive' } } },
          select: { id: true },
        });
        if (!held) await this.limits.assertWithin(tenant.orgId, 'members', 1);
        const teamId = await teamFor(row.team);
        const res = await this.members.invite(tenant, { email: row.email, name: row.name || undefined, role: row.role, teamId });
        r.status = res.status;
        r.emailSent = res.emailSent;
      } catch (err) {
        if (err instanceof ConflictException) {
          r.status = 'member';
        } else {
          r.status = 'failed';
          r.reason = reasonOf(err);
          if (/plan limit/i.test(r.reason)) r.code = 'plan-limit';
          continue;
        }
      }

      if (input.createCards) {
        try {
          r.card = await this.cardFor(tenant, row, org?.name ?? null, input.lang);
        } catch (err) {
          r.card = 'failed';
          r.reason = reasonOf(err);
          if (/plan limit/i.test(r.reason)) r.code = 'plan-limit';
        }
      }
    }

    await this.audit.log(tenant, 'members.imported', {
      metadata: {
        rows: input.rows.length,
        invited: results.filter((r) => r.status === 'invited' || r.status === 'added').length,
        cards: results.filter((r) => r.card === 'created').length,
      },
    });
    return { results };
  }

  /** A card for the person, unless they already have one in this workspace. */
  private async cardFor(tenant: TenantContext, row: ImportMembersInput['rows'][number], company: string | null, lang: 'en' | 'ar'): Promise<CardOutcome> {
    const user = await this.db.user.findFirst({ where: { email: { equals: row.email, mode: 'insensitive' } }, select: { id: true } });
    if (!user) return 'failed';
    const has = await this.db.card.findFirst({ where: { ownerId: user.id }, select: { id: true } });
    if (has) return 'exists';

    const fullName = row.name || row.email.split('@')[0]!;
    const input = {
      templateId: 'swiss-blue',
      theme: { accent: '#2563eb', mode: 'light', cover: 'gradient', lang },
      fullName,
      title: row.title || undefined,
      ownerId: user.id,
    };
    // A name in Arabic makes no address of its own, so the card's address
    // comes from the email (sara.mansour@… → /c/sara-mansour) when it can.
    const fromEmail = slugOf(row.email.split('@')[0]!);
    let card: { id: string } | undefined;
    if (!/[a-z]/i.test(fullName) && fromEmail) {
      try {
        card = await this.cards.create(tenant, { ...input, slug: fromEmail });
      } catch (err) {
        if (!(err instanceof ConflictException)) throw err;
      }
    }
    card ??= await this.cards.create(tenant, input);
    const vcardData: Record<string, string> = { fullName, email: row.email };
    if (row.title) vcardData.title = row.title;
    if (company) vcardData.company = company;
    if (row.phone) vcardData.phone = row.phone;
    await this.db.card.update({ where: { id: card.id }, data: { vcardData: vcardData as Prisma.InputJsonValue } });

    // The ways to reach them, so the card works as soon as it is published.
    const actions: { type: 'WHATSAPP' | 'CALL' | 'EMAIL'; config: Record<string, unknown> }[] = [];
    if (row.phone && digits(row.phone).length >= 8) {
      actions.push({ type: 'WHATSAPP', config: { phone: row.phone, isQuick: true } });
      actions.push({ type: 'CALL', config: { phone: row.phone, isQuick: true } });
    }
    actions.push({ type: 'EMAIL', config: { email: row.email, isQuick: true } });
    await this.db.cardAction.createMany({
      data: actions.map((a, order) => ({ cardId: card.id, type: a.type, order, isActive: true, config: a.config as Prisma.InputJsonValue })),
    });
    return 'created';
  }
}

function reasonOf(err: unknown): string {
  if (err instanceof ForbiddenException || err instanceof HttpException) {
    const res = err.getResponse();
    const msg = typeof res === 'string' ? res : (res as { message?: string | string[] }).message;
    return Array.isArray(msg) ? msg.join(', ') : msg || err.message;
  }
  return 'Something went wrong';
}
