import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { duplicateGroups, duplicateKey, emailKey, phoneKey } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookService } from '../integrations/webhook.service';
import { leadsVisibleTo } from './lead-visibility';

const HEAT = { COLD: 0, WARM: 1, HOT: 2 } as const;
const FIELDS = ['name', 'email', 'phone', 'company'] as const;

const SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  company: true,
  source: true,
  value: true,
  score: true,
  temperature: true,
  stageId: true,
  assignedTo: true,
  cardId: true,
  tagId: true,
  firstContactedAt: true,
  lastContactedAt: true,
  createdAt: true,
} as const;

type Row = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  value: number;
  score: number;
  temperature: keyof typeof HEAT;
  stageId: string | null;
  assignedTo: string | null;
  cardId: string | null;
  tagId: string | null;
  firstContactedAt: Date | null;
  lastContactedAt: Date | null;
  createdAt: Date;
};

const earliest = (dates: (Date | null)[]) => dates.filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
const latest = (dates: (Date | null)[]) => dates.filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

/**
 * What the kept lead becomes: its own details, gaps filled from the others
 * (oldest first), the higher value and score, the hotter temperature, and
 * the first and last time anyone reached out across them all. It dates from
 * the first time this person came in. Details that differed are listed so
 * nothing is lost.
 */
export function mergedLead(keep: Row, others: Row[]) {
  const all = [keep, ...[...others].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())];
  const pick = <K extends keyof Row>(k: K) => all.map((l) => l[k]).find((v) => v !== null && v !== '') ?? null;
  const data = {
    name: pick('name') as string | null,
    email: pick('email') as string | null,
    phone: pick('phone') as string | null,
    company: pick('company') as string | null,
    stageId: pick('stageId') as string | null,
    assignedTo: pick('assignedTo') as string | null,
    cardId: pick('cardId') as string | null,
    tagId: pick('tagId') as string | null,
    value: Math.max(...all.map((l) => l.value)),
    score: Math.max(...all.map((l) => l.score)),
    temperature: all.map((l) => l.temperature).sort((a, b) => HEAT[b] - HEAT[a])[0]!,
    firstContactedAt: earliest(all.map((l) => l.firstContactedAt)),
    lastContactedAt: latest(all.map((l) => l.lastContactedAt)),
    createdAt: earliest(all.map((l) => l.createdAt))!,
  };
  // The second email, the other phone number…: kept in the merge record.
  // (The same number or address written another way is not a different one.)
  const same = (f: (typeof FIELDS)[number], a: string, b: string | null) =>
    f === 'phone' ? phoneKey(a) === phoneKey(b) : f === 'email' ? emailKey(a) === emailKey(b) : a.trim().toLowerCase() === (b ?? '').trim().toLowerCase();
  const differing: Record<string, string[]> = {};
  for (const f of FIELDS) {
    const extra: string[] = [];
    for (const v of others.map((l) => l[f])) if (v && !same(f, v, data[f]) && !extra.some((e) => same(f, e, v))) extra.push(v);
    if (extra.length) differing[f] = extra;
  }
  return { data, differing };
}

/** Finding the same person entered twice (same email or phone), and making them one lead. */
@Injectable()
export class LeadMergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhookService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  /** Every group of leads this person can see that look like one person, newest group first. */
  async duplicates(viewer: TenantContext) {
    const leads = await this.db.lead.findMany({
      where: { ...leadsVisibleTo(viewer), OR: [{ email: { not: null } }, { phone: { not: null } }] },
      orderBy: { createdAt: 'desc' },
      select: { ...SELECT, assignee: { select: { name: true, email: true } } },
      take: 5000,
    });
    const dismissed = new Set(await this.dismissed());
    return duplicateGroups(leads)
      .filter((g) => !dismissed.has(duplicateKey(g.leads)))
      .slice(0, 200);
  }

  /** The groups someone in the workspace said are different people. */
  async dismissed(): Promise<string[]> {
    const rows = await this.db.duplicateDismissal.findMany({ select: { key: true } });
    return rows.map((r) => r.key);
  }

  /** "Not the same person": the group stops showing for everyone (until another lead joins it). */
  async dismiss(viewer: TenantContext, leadIds: string[]) {
    const ids = [...new Set(leadIds)];
    if (ids.length < 2) throw new BadRequestException('Choose at least two leads');
    const seen = await this.db.lead.count({ where: { id: { in: ids }, ...leadsVisibleTo(viewer) } });
    if (seen !== ids.length) throw new NotFoundException('Lead not found');
    const key = duplicateKey(ids.map((id) => ({ id })));
    await this.db.duplicateDismissal.upsert({
      where: { orgId_key: { orgId: viewer.orgId, key } },
      create: { orgId: viewer.orgId, key, createdById: viewer.userId },
      update: {},
    });
    return { key };
  }

  /** Folds `duplicateIds` into `keepId`: their history and tasks move over, then they are deleted. */
  async merge(viewer: TenantContext, keepId: string, duplicateIds: string[]) {
    const ids = [...new Set(duplicateIds)].filter((d) => d !== keepId);
    if (!ids.length) throw new BadRequestException('Choose at least one other lead to merge');
    const rows = (await this.db.lead.findMany({ where: { id: { in: [keepId, ...ids] }, ...leadsVisibleTo(viewer) }, select: SELECT })) as Row[];
    const keep = rows.find((r) => r.id === keepId);
    if (!keep || rows.length !== ids.length + 1) throw new NotFoundException('Lead not found');
    const others = rows.filter((r) => r.id !== keepId);
    const { data, differing } = mergedLead(keep, others);
    const now = new Date();

    await this.db.$transaction(async (tx) => {
      await tx.leadActivity.updateMany({ where: { leadId: { in: ids } }, data: { leadId: keepId } });
      await tx.task.updateMany({ where: { leadId: { in: ids } }, data: { leadId: keepId } });
      await tx.lead.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now } });
      await tx.lead.update({ where: { id: keepId }, data });
      await tx.leadActivity.create({
        data: {
          leadId: keepId,
          type: 'MERGE',
          metadata: {
            by: viewer.userId,
            merged: others.map((o) => ({ id: o.id, name: o.name, email: o.email, phone: o.phone, company: o.company, source: o.source, createdAt: o.createdAt.toISOString() })),
            differing,
          },
        },
      });
    });

    void this.webhooks
      .emit(viewer.orgId, 'lead.updated', { leadId: keepId, merged: ids, name: data.name, email: data.email, phone: data.phone, company: data.company })
      .catch(() => undefined);
    return { id: keepId, merged: ids.length };
  }
}
