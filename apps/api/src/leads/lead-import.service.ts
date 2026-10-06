import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import {
  emailKey,
  phoneKey,
  type ImportLeadRow,
  type ImportLeadsInput,
  type ImportLeadsResult,
  type ImportNotice,
  type ImportProblem,
  type ImportRowResult,
} from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../organizations/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { leadsVisibleTo } from './lead-visibility';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Existing = { id: string; name: string | null; email: string | null; phone: string | null; company: string | null; value: number };

/** The day a row says it came in, at noon UTC so no time zone moves it a day; null if not a real past date. */
export function importedDay(day: string | undefined, now = new Date()): Date | null | undefined {
  if (!day) return undefined;
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day) return null;
  if (d.getUTCFullYear() < 1990 || d > now) return null;
  return d;
}

/**
 * Leads brought in from a spreadsheet: each row checked, matched against the
 * leads already here by email and phone, then created together. A dry run
 * says what would happen, row by row, for the preview.
 *
 * Someone who sees only their own leads imports for themselves and is matched
 * only against theirs; managers and above may hand rows to teammates.
 */
@Injectable()
export class LeadImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async import(tenant: TenantContext, input: ImportLeadsInput): Promise<ImportLeadsResult> {
    const mayAssign = tenant.role !== 'EMPLOYEE';
    const [stages, members, existing] = await Promise.all([
      this.db.pipelineStage.findMany({ orderBy: { order: 'asc' }, select: { id: true } }),
      mayAssign
        ? this.db.membership.findMany({ where: { status: 'ACTIVE' }, select: { userId: true, user: { select: { email: true } } } })
        : Promise.resolve([] as { userId: string; user: { email: string } }[]),
      this.db.lead.findMany({ where: leadsVisibleTo(tenant), select: { id: true, name: true, email: true, phone: true, company: true, value: true } }),
    ]);
    const stageIds = new Set(stages.map((s) => s.id));
    const firstStage = stages[0]?.id ?? null;
    const memberByEmail = new Map(members.map((m) => [m.user.email.toLowerCase(), m.userId]));

    // Every lead already here, and each row taken so far, by its email and phone.
    const known = new Map<string, Existing | { line: number }>();
    const remember = (key: string | null, v: Existing | { line: number }) => key && !known.has(key) && known.set(key, v);
    for (const l of existing) {
      remember(emailKey(l.email) && `e:${emailKey(l.email)}`, l);
      remember(phoneKey(l.phone) && `p:${phoneKey(l.phone)}`, l);
    }

    const results: ImportRowResult[] = [];
    const creates: { row: ImportLeadRow; result: ImportRowResult; assignedTo: string; stageId: string | null; createdAt?: Date }[] = [];
    const fills: { row: ImportLeadRow; lead: Existing; result: ImportRowResult }[] = [];

    for (const row of input.rows) {
      const email = row.email?.trim().toLowerCase().replace(/^mailto:/, '') || undefined;
      const r = { ...row, email };
      const result: ImportRowResult = { line: row.line, outcome: 'create' };
      results.push(result);

      const problem: ImportProblem | null = !r.name && !email && !r.phone ? 'empty' : email && !EMAIL.test(email) ? 'badEmail' : importedDay(r.createdOn) === null ? 'badDate' : null;
      if (problem) {
        result.outcome = 'invalid';
        result.problem = problem;
        continue;
      }

      const keys = [emailKey(email) && `e:${emailKey(email)}`, phoneKey(r.phone) && `p:${phoneKey(r.phone)}`].filter((k): k is string => !!k);
      const match = keys.map((k) => known.get(k)).find(Boolean);
      if (match) {
        result.outcome = 'duplicate';
        if ('id' in match) {
          result.leadId = match.id;
          if (input.duplicates === 'fill' && this.fillable(match, r)) {
            result.outcome = 'fill';
            fills.push({ row: r, lead: match, result });
          }
        }
        continue;
      }
      for (const k of keys) known.set(k, { line: row.line });

      const notices: ImportNotice[] = [];
      let assignedTo = tenant.userId;
      if (r.owner && mayAssign) {
        const id = memberByEmail.get(r.owner.trim().toLowerCase());
        if (id) assignedTo = id;
        else notices.push('unknownOwner');
      }
      let stageId = firstStage;
      if (r.stageId) {
        if (stageIds.has(r.stageId)) stageId = r.stageId;
        else notices.push('unknownStage');
      }
      if (notices.length) result.notices = notices;
      creates.push({ row: r, result, assignedTo, stageId, createdAt: importedDay(r.createdOn) ?? undefined });
    }

    const summary = (): ImportLeadsResult => ({
      created: results.filter((x) => x.outcome === 'create').length,
      filled: results.filter((x) => x.outcome === 'fill').length,
      duplicates: results.filter((x) => x.outcome === 'duplicate').length,
      invalid: results.filter((x) => x.outcome === 'invalid').length,
      rows: results,
    });
    if (input.dryRun || (!creates.length && !fills.length)) return summary();

    await this.db.$transaction(async (tx) => {
      if (creates.length) {
        const made = await tx.lead.createManyAndReturn({
          data: creates.map(({ row, assignedTo, stageId, createdAt }) => ({
            orgId: tenant.orgId,
            assignedTo,
            stageId,
            name: row.name || null,
            email: row.email || null,
            phone: row.phone || null,
            company: row.company || null,
            value: row.value ? Math.round(row.value) : 0,
            temperature: row.temperature ?? 'COLD',
            source: 'import',
            ...(createdAt ? { createdAt } : {}),
          })),
          select: { id: true },
        });
        made.forEach((m, i) => (creates[i]!.result.leadId = m.id));
        const notes = creates.filter(({ row }) => row.title || row.note);
        if (notes.length) {
          await tx.leadActivity.createMany({
            data: notes.map(({ row, result }) => ({
              leadId: result.leadId!,
              type: 'NOTE' as const,
              metadata: { note: [row.title, row.note].filter(Boolean).join('\n'), title: row.title ?? null, source: 'import' },
            })),
          });
        }
      }
      for (const { row, lead } of fills) {
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            ...(!lead.name && row.name ? { name: row.name } : {}),
            ...(!lead.email && row.email ? { email: row.email } : {}),
            ...(!lead.phone && row.phone ? { phone: row.phone } : {}),
            ...(!lead.company && row.company ? { company: row.company } : {}),
            ...(!lead.value && row.value ? { value: Math.round(row.value) } : {}),
          },
        });
        if (row.title || row.note) {
          await tx.leadActivity.create({
            data: { leadId: lead.id, type: 'NOTE', metadata: { note: [row.title, row.note].filter(Boolean).join('\n'), title: row.title ?? null, source: 'import' } },
          });
        }
      }
    });

    const out = summary();
    await this.audit.log(tenant, 'leads.imported', { targetType: 'lead', metadata: { created: out.created, filled: out.filled, duplicates: out.duplicates, invalid: out.invalid } });

    // Teammates handed leads hear it once, with how many.
    const handed = new Map<string, number>();
    for (const c of creates) if (c.assignedTo !== tenant.userId) handed.set(c.assignedTo, (handed.get(c.assignedTo) ?? 0) + 1);
    for (const [userId, count] of handed) {
      await this.notifications.notify({
        userId,
        orgId: tenant.orgId,
        actorId: tenant.userId,
        type: 'lead.imported',
        category: 'CRM',
        priority: 'LOW',
        title: `${count} imported leads were assigned to you`,
        metadata: { count },
      });
    }
    return out;
  }

  /** Whether the row has anything the lead is missing. */
  private fillable(lead: Existing, row: ImportLeadRow) {
    return (
      (!lead.name && !!row.name) ||
      (!lead.email && !!row.email) ||
      (!lead.phone && !!row.phone) ||
      (!lead.company && !!row.company) ||
      (!lead.value && !!row.value) ||
      !!row.title ||
      !!row.note
    );
  }
}
