import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialVault } from './credential-vault.service';
import { AutomationService } from './automation.service';
import { CrmSyncService } from './crm/crm-sync.service';
import { AuditService } from '../organizations/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { signWebhook, SIGNATURE_HEADER } from './webhook-signature';

/** Every event an endpoint may subscribe to (section 10). '*' means all. */
export const WEBHOOK_EVENTS = [
  'lead.created',
  'lead.updated',
  'contact.saved',
  'card.viewed',
  'qr.scanned',
  'nfc.tapped',
  'meeting.requested',
  'quote.requested',
  'identity.viewed',
  'identity.switched',
  'organization.created',
  'member.added',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const RESPONSE_BODY_CAP = 2048;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Backoff schedule for a failed delivery, indexed by the attempt just made
 * (1-based). Returns seconds to wait before the next attempt. Capped and
 * finite; a pure function so the retry policy can be tested without the clock.
 */
export function backoffSeconds(attempt: number): number {
  const schedule = [60, 300, 1800, 7200, 21600, 86400]; // 1m,5m,30m,2h,6h,24h
  return schedule[Math.min(attempt - 1, schedule.length - 1)];
}

interface CredentialAADParts {
  orgId: string;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: CredentialVault,
    private readonly automations: AutomationService,
    private readonly crmSync: CrmSyncService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private aad({ orgId }: CredentialAADParts): string {
    return `webhook:${orgId}`;
  }

  /**
   * Endpoints must be https in production. A loopback http URL is allowed so
   * local receivers (dev, tests, a tunnel) can be used — the public internet
   * still requires TLS.
   */
  private validateUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Webhook URL is not valid.');
    }
    const isLoopback =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1';
    if (parsed.protocol === 'https:') return;
    if (parsed.protocol === 'http:' && isLoopback) return;
    throw new BadRequestException('Webhook URL must be https.');
  }

  private validateEvents(events: string[]): void {
    const allowed = new Set<string>([...WEBHOOK_EVENTS, '*']);
    const bad = events.filter((e) => !allowed.has(e));
    if (bad.length) {
      throw new BadRequestException(`Unknown event(s): ${bad.join(', ')}`);
    }
  }

  /** Public projection — never exposes the encrypted secret. */
  private present(e: {
    id: string;
    url: string;
    description: string | null;
    secretHint: string;
    events: string[];
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: e.id,
      url: e.url,
      description: e.description,
      secretHint: `whsec_…${e.secretHint}`,
      events: e.events,
      enabled: e.enabled,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }

  // ---- Endpoint management ----

  async list(tenant: TenantContext) {
    const rows = await this.db.webhookEndpoint.findMany({
      where: { orgId: tenant.orgId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.present(r));
  }

  /**
   * Creates an endpoint and returns the raw signing secret ONCE. The secret is
   * stored encrypted; it is never retrievable again — only rotated.
   */
  async create(
    tenant: TenantContext,
    input: { url: string; description?: string; events: string[] },
  ) {
    if (!this.vault.enabled) {
      throw new BadRequestException(
        'Webhook signing is not configured on this server (INTEGRATION_ENCRYPTION_KEY).',
      );
    }
    this.validateUrl(input.url);
    this.validateEvents(input.events);

    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    const created = await this.db.webhookEndpoint.create({
      data: {
        orgId: tenant.orgId,
        url: input.url,
        description: input.description,
        secret: this.vault.encrypt(secret, this.aad({ orgId: tenant.orgId })),
        secretHint: secret.slice(-4),
        events: input.events,
        createdBy: tenant.userId,
      },
    });
    await this.audit.log(tenant, 'webhook.created', {
      targetType: 'webhook', targetId: created.id, metadata: { url: input.url, events: input.events },
    });
    // The plaintext secret is returned here and nowhere else.
    return { ...this.present(created), secret };
  }

  async update(
    tenant: TenantContext,
    id: string,
    input: { url?: string; description?: string; events?: string[]; enabled?: boolean },
  ) {
    await this.getOwned(tenant, id);
    if (input.url) this.validateUrl(input.url);
    if (input.events) this.validateEvents(input.events);
    const updated = await this.db.webhookEndpoint.update({
      where: { id },
      data: {
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.events !== undefined ? { events: input.events } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });
    return this.present(updated);
  }

  async remove(tenant: TenantContext, id: string) {
    await this.getOwned(tenant, id);
    await this.db.webhookEndpoint.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log(tenant, 'webhook.deleted', { targetType: 'webhook', targetId: id });
    return { ok: true as const };
  }

  /** Issues a new signing secret, returned once, and invalidates the old one. */
  async rotateSecret(tenant: TenantContext, id: string) {
    await this.getOwned(tenant, id);
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    await this.db.webhookEndpoint.update({
      where: { id },
      data: {
        secret: this.vault.encrypt(secret, this.aad({ orgId: tenant.orgId })),
        secretHint: secret.slice(-4),
      },
    });
    await this.audit.log(tenant, 'webhook.secret_rotated', { targetType: 'webhook', targetId: id });
    return { secret };
  }

  private async getOwned(tenant: TenantContext, id: string) {
    // orgId is auto-injected by the tenant layer, so a foreign id resolves to null.
    const endpoint = await this.db.webhookEndpoint.findFirst({ where: { id } });
    if (!endpoint) throw new NotFoundException('Webhook endpoint not found');
    return endpoint;
  }

  // ---- Emitting events ----

  /**
   * Queues a signed delivery of `event` to every enabled endpoint in `orgId`
   * that subscribes to it. Returns the number of deliveries queued. This only
   * persists the work; the dispatcher performs the HTTP send, so an emit never
   * blocks the request that triggered it and survives a restart.
   */
  async emit(orgId: string, event: WebhookEvent, data: unknown): Promise<number> {
    const eventId = `evt_${randomUUID()}`;
    const payload = {
      id: eventId,
      event,
      createdAt: new Date().toISOString(),
      data,
    };

    // Run any matching automations off the same event. Independent of webhook
    // endpoints — an automation fires even when nothing is subscribed. Best-
    // effort so it never blocks or fails the emit.
    void this.automations.run(orgId, event, payload).catch(() => undefined);

    // Push to any connected CRM whose sync is enabled (e.g. lead.created →
    // HubSpot contact). Also best-effort and non-blocking.
    void this.crmSync.onEvent(orgId, event, data).catch(() => undefined);

    const endpoints = await this.db.webhookEndpoint.findMany({
      where: {
        orgId,
        enabled: true,
        OR: [{ events: { has: event } }, { events: { has: '*' } }],
      },
      select: { id: true },
    });
    if (endpoints.length === 0) return 0;

    await this.db.webhookDelivery.createMany({
      data: endpoints.map((e) => ({
        orgId,
        endpointId: e.id,
        event,
        eventId,
        payload,
        status: 'PENDING' as const,
        nextAttemptAt: new Date(),
      })),
    });
    return endpoints.length;
  }

  // ---- Delivery (called by the dispatcher, and by replay) ----

  /**
   * Delivers up to `limit` due deliveries (PENDING/FAILED, past their
   * nextAttemptAt, under maxAttempts). Runs with no tenant context so it spans
   * all organizations; each delivery already carries its own orgId. Returns how
   * many were attempted.
   */
  async deliverDue(limit = 25, now = new Date()): Promise<number> {
    const due = await this.db.webhookDelivery.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        nextAttemptAt: { lte: now },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
    });
    for (const delivery of due) {
      await this.attempt(delivery);
    }
    return due.length;
  }

  private async attempt(delivery: {
    id: string;
    orgId: string;
    endpointId: string;
    event: string;
    eventId: string;
    payload: unknown;
    attempts: number;
    maxAttempts: number;
  }): Promise<void> {
    const endpoint = await this.db.webhookEndpoint.findUnique({
      where: { id: delivery.endpointId },
      select: { url: true, secret: true, enabled: true, deletedAt: true },
    });
    if (!endpoint || endpoint.deletedAt || !endpoint.enabled) {
      // Endpoint gone or disabled since queuing — stop trying.
      await this.db.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'FAILED', error: 'Endpoint disabled or deleted', nextAttemptAt: null },
      });
      return;
    }

    const rawBody = JSON.stringify(delivery.payload);
    const ts = Math.floor(Date.now() / 1000);
    let secret: string;
    try {
      secret = this.vault.decrypt(endpoint.secret, this.aad({ orgId: delivery.orgId }));
    } catch {
      await this.db.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'FAILED', error: 'Signing secret could not be read', nextAttemptAt: null },
      });
      return;
    }

    const attemptNo = delivery.attempts + 1;
    const started = Date.now();
    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let error: string | null = null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'VertexConnect-Webhooks/1',
          [SIGNATURE_HEADER]: signWebhook(rawBody, secret, ts),
          'x-vertex-event': delivery.event,
          'x-vertex-event-id': delivery.eventId, // idempotency key for the receiver
          'x-vertex-delivery': delivery.id,
        },
        body: rawBody,
        signal: controller.signal,
      });
      clearTimeout(timer);
      responseStatus = res.status;
      responseBody = (await res.text()).slice(0, RESPONSE_BODY_CAP);
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (e) {
      error = (e as Error).name === 'AbortError' ? 'Request timed out' : (e as Error).message;
    }

    const durationMs = Date.now() - started;
    const succeeded = error === null;

    if (succeeded) {
      await this.db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SUCCESS',
          attempts: attemptNo,
          responseStatus,
          responseBody,
          error: null,
          durationMs,
          deliveredAt: new Date(),
          nextAttemptAt: null,
        },
      });
      return;
    }

    const exhausted = attemptNo >= delivery.maxAttempts;
    await this.db.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'FAILED',
        attempts: attemptNo,
        responseStatus,
        responseBody,
        error,
        durationMs,
        // Schedule the next retry unless we've exhausted attempts.
        nextAttemptAt: exhausted
          ? null
          : new Date(Date.now() + backoffSeconds(attemptNo) * 1000),
      },
    });

    // On permanent failure, alert the workspace admins (section 29). Runs in the
    // dispatcher with no tenant context, so notify the org explicitly.
    if (exhausted) {
      await this.notifications
        .notifyOrgAdmins(delivery.orgId, null, {
          type: 'webhook.failed',
          category: 'SYSTEM',
          priority: 'HIGH',
          title: 'Webhook delivery failed',
          body: `Event ${delivery.event} could not be delivered after ${attemptNo} attempts (${error}).`,
          metadata: { deliveryId: delivery.id, event: delivery.event },
        })
        .catch(() => undefined);
    }
  }

  // ---- Delivery log & replay ----

  async deliveries(
    tenant: TenantContext,
    filter: { endpointId?: string; status?: string; limit?: number } = {},
  ) {
    return this.db.webhookDelivery.findMany({
      where: {
        orgId: tenant.orgId,
        ...(filter.endpointId ? { endpointId: filter.endpointId } : {}),
        ...(filter.status ? { status: filter.status as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 50, 200),
    });
  }

  /** Re-queues a delivery for immediate re-send, keeping its idempotency key. */
  async replay(tenant: TenantContext, deliveryId: string) {
    const delivery = await this.db.webhookDelivery.findFirst({
      where: { id: deliveryId, orgId: tenant.orgId },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    await this.db.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'PENDING', nextAttemptAt: new Date(), error: null },
    });
    return { ok: true as const };
  }
}
