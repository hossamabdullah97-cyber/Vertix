import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../organizations/audit.service';
import {
  evaluateConditions,
  type Condition,
  type MatchType,
} from './automation-conditions';

const ACTION_TIMEOUT_MS = 8000;

type ActionType = 'notify' | 'task' | 'webhook';
interface Action {
  type: ActionType;
  config: Record<string, unknown>;
}
interface ActionResult {
  type: ActionType;
  ok: boolean;
  detail: string;
}

/**
 * The no-code automation engine (sections 24–25). When a domain event fires,
 * every enabled automation for that trigger is evaluated; matching ones run
 * their actions server-side and the execution is logged as an AutomationRun.
 * Actions are real — an in-app notification, a CRM task, or an HTTP POST — none
 * require an external OAuth connection.
 */
@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  // ---------------------------------------------------------------- execution

  /**
   * Runs every enabled automation triggered by `event` in `orgId`. Called from
   * the domain-event bus with no tenant context, so orgId is passed explicitly.
   * Best-effort: an automation failure is logged, never thrown to the caller.
   */
  async run(orgId: string, event: string, payload: unknown): Promise<void> {
    let automations: Array<{
      id: string;
      matchType: string;
      conditions: unknown;
      actions: unknown;
    }>;
    try {
      automations = await this.db.automation.findMany({
        where: { orgId, trigger: event, enabled: true },
        select: { id: true, matchType: true, conditions: true, actions: true },
      });
    } catch (err) {
      this.logger.warn(`automation lookup failed: ${(err as Error).message}`);
      return;
    }

    for (const a of automations) {
      const conditions = (a.conditions as Condition[]) ?? [];
      const matched = evaluateConditions(conditions, a.matchType as MatchType, payload);
      if (!matched) continue; // skips are not logged, to keep the run log signal-rich

      const actions = (a.actions as Action[]) ?? [];
      const results: ActionResult[] = [];
      for (const action of actions) {
        results.push(await this.execute(orgId, action, event, payload));
      }
      const okCount = results.filter((r) => r.ok).length;
      const status =
        okCount === results.length ? 'SUCCESS' : okCount === 0 ? 'FAILED' : 'PARTIAL';

      try {
        await this.db.$transaction([
          this.db.automationRun.create({
            data: {
              orgId,
              automationId: a.id,
              event,
              status,
              matched: true,
              actionsRun: okCount,
              results: results as never,
              error: status === 'SUCCESS' ? null : results.find((r) => !r.ok)?.detail,
            },
          }),
          this.db.automation.update({
            where: { id: a.id },
            data: { runCount: { increment: 1 }, lastRunAt: new Date() },
          }),
        ]);
      } catch (err) {
        this.logger.warn(`automation run log failed: ${(err as Error).message}`);
      }

      // Alert admins when an automation failed to carry out its actions (section 29).
      if (status !== 'SUCCESS') {
        await this.notifications
          .notifyOrgAdmins(orgId, null, {
            type: 'automation.failed',
            category: 'SYSTEM',
            priority: 'HIGH',
            title: 'Automation action failed',
            body: `An automation on ${event} ran with ${okCount}/${results.length} actions succeeding.`,
            metadata: { automationId: a.id, event },
          })
          .catch(() => undefined);
      }
    }
  }

  private async execute(
    orgId: string,
    action: Action,
    event: string,
    payload: unknown,
  ): Promise<ActionResult> {
    try {
      switch (action.type) {
        case 'notify':
          return await this.doNotify(orgId, action.config, event, payload);
        case 'task':
          return await this.doTask(orgId, action.config, payload);
        case 'webhook':
          return await this.doWebhook(action.config, event, payload);
        default:
          return { type: action.type, ok: false, detail: 'Unknown action type' };
      }
    } catch (err) {
      return { type: action.type, ok: false, detail: (err as Error).message };
    }
  }

  private async doNotify(
    orgId: string,
    config: Record<string, unknown>,
    event: string,
    payload: unknown,
  ): Promise<ActionResult> {
    const title = String(config.title || 'Automation triggered');
    const body = config.body ? String(config.body) : undefined;
    await this.notifications.notifyOrgAdmins(orgId, null, {
      type: 'automation.triggered',
      category: 'SYSTEM',
      priority: 'MEDIUM',
      title,
      body,
      metadata: { event, data: (payload as { data?: unknown })?.data },
    });
    return { type: 'notify', ok: true, detail: 'Notified workspace admins' };
  }

  private async doTask(
    orgId: string,
    config: Record<string, unknown>,
    payload: unknown,
  ): Promise<ActionResult> {
    const title = String(config.title || 'Follow up');
    const dueInDays = Number(config.dueInDays);
    const leadId = (payload as { data?: { leadId?: string } })?.data?.leadId;
    await this.db.task.create({
      data: {
        orgId,
        title,
        notes: config.notes ? String(config.notes) : null,
        leadId: leadId ?? null,
        dueDate: Number.isFinite(dueInDays)
          ? new Date(Date.now() + dueInDays * 86_400_000)
          : null,
      },
    });
    return { type: 'task', ok: true, detail: `Created task "${title}"` };
  }

  private async doWebhook(
    config: Record<string, unknown>,
    event: string,
    payload: unknown,
  ): Promise<ActionResult> {
    const url = String(config.url || '');
    this.assertUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ACTION_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'VertexConnect-Automations/1' },
        body: JSON.stringify({ event, ...(payload as object) }),
        signal: controller.signal,
      });
      return {
        type: 'webhook',
        ok: res.ok,
        detail: `POST ${url} -> HTTP ${res.status}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private assertUrl(url: string): void {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new Error('Invalid webhook URL');
    }
    const loopback =
      u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
    if (u.protocol === 'https:' || (u.protocol === 'http:' && loopback)) return;
    throw new Error('Webhook URL must be https');
  }

  // ---------------------------------------------------------------------- CRUD

  private validate(input: { trigger?: string; actions?: Action[]; conditions?: Condition[] }): void {
    const validActions = new Set<ActionType>(['notify', 'task', 'webhook']);
    for (const a of input.actions ?? []) {
      if (!validActions.has(a.type)) throw new BadRequestException(`Unknown action type: ${a.type}`);
      if (a.type === 'webhook') this.assertUrl(String(a.config?.url ?? ''));
    }
  }

  private present(a: {
    id: string;
    name: string;
    description: string | null;
    enabled: boolean;
    trigger: string;
    matchType: string;
    conditions: unknown;
    actions: unknown;
    runCount: number;
    lastRunAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      enabled: a.enabled,
      trigger: a.trigger,
      matchType: a.matchType,
      conditions: a.conditions,
      actions: a.actions,
      runCount: a.runCount,
      lastRunAt: a.lastRunAt,
      createdAt: a.createdAt,
    };
  }

  async list(_tenant: TenantContext) {
    const rows = await this.db.automation.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((r) => this.present(r));
  }

  async create(
    tenant: TenantContext,
    input: {
      name: string;
      description?: string;
      trigger: string;
      matchType?: MatchType;
      conditions?: Condition[];
      actions?: Action[];
    },
  ) {
    this.validate(input);
    const created = await this.db.automation.create({
      data: {
        orgId: tenant.orgId,
        name: input.name,
        description: input.description,
        trigger: input.trigger,
        matchType: input.matchType ?? 'ALL',
        conditions: (input.conditions ?? []) as never,
        actions: (input.actions ?? []) as never,
        createdBy: tenant.userId,
      },
    });
    await this.audit.log(tenant, 'automation.created', {
      targetType: 'automation', targetId: created.id, metadata: { name: input.name, trigger: input.trigger },
    });
    return this.present(created);
  }

  private async owned(id: string) {
    const a = await this.db.automation.findFirst({ where: { id } }); // orgId auto-injected
    if (!a) throw new NotFoundException('Automation not found');
    return a;
  }

  async update(
    tenant: TenantContext,
    id: string,
    input: {
      name?: string;
      description?: string;
      enabled?: boolean;
      trigger?: string;
      matchType?: MatchType;
      conditions?: Condition[];
      actions?: Action[];
    },
  ) {
    await this.owned(id);
    this.validate(input);
    const updated = await this.db.automation.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
        ...(input.matchType !== undefined ? { matchType: input.matchType } : {}),
        ...(input.conditions !== undefined ? { conditions: input.conditions as never } : {}),
        ...(input.actions !== undefined ? { actions: input.actions as never } : {}),
      },
    });
    await this.audit.log(tenant, 'automation.updated', { targetType: 'automation', targetId: id });
    return this.present(updated);
  }

  async remove(tenant: TenantContext, id: string) {
    await this.owned(id);
    await this.db.automation.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log(tenant, 'automation.deleted', { targetType: 'automation', targetId: id });
    return { ok: true as const };
  }

  async runs(tenant: TenantContext, automationId?: string) {
    return this.db.automationRun.findMany({
      where: { ...(automationId ? { automationId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
