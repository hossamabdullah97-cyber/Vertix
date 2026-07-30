import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuthService } from '../oauth.service';
import { AuditService } from '../../organizations/audit.service';
import { HubSpotConnector } from './hubspot.connector';
import {
  applyMapping,
  DEFAULT_HUBSPOT_MAPPING,
  MAPPABLE_VERTEX_FIELDS,
  type FieldMapping,
  type SyncableLead,
} from './field-mapping';

/** Providers that support CRM lead sync, and their default field mapping. */
const CRM_PROVIDERS: Record<string, { defaultMapping: FieldMapping }> = {
  hubspot: { defaultMapping: DEFAULT_HUBSPOT_MAPPING },
};

export interface CrmSyncConfig {
  syncEnabled: boolean;
  direction: 'push'; // Vertex → External (one-way) for now
  fieldMapping: FieldMapping;
}

/**
 * Synchronizes Vertex CRM leads into an external CRM over the OAuth framework
 * (sections 5–8). Push is one-way (Vertex → External). A per-lead sync record
 * makes it idempotent: a lead maps to exactly one external contact, so repeats
 * update rather than duplicate. Real HTTP calls carry the framework's OAuth
 * token; a provider that is not connected simply does not sync.
 */
@Injectable()
export class CrmSyncService {
  private readonly logger = new Logger(CrmSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly oauth: OAuthService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  isCrmProvider(provider: string): boolean {
    return provider in CRM_PROVIDERS;
  }

  private connectorFor(provider: string) {
    if (provider === 'hubspot') {
      const base =
        this.config.get<string>('OAUTH_HUBSPOT_API_URL') || 'https://api.hubapi.com';
      return new HubSpotConnector(base);
    }
    throw new BadRequestException(`${provider} is not a supported CRM connector.`);
  }

  // ------------------------------------------------------------------- config

  /** The sync config for a provider on this org (from connection.config.crm). */
  async getConfig(orgId: string, provider: string): Promise<CrmSyncConfig> {
    const conn = await this.db.integrationConnection.findFirst({
      where: { orgId, provider, deletedAt: null },
      select: { config: true },
    });
    const crm = (conn?.config as { crm?: Partial<CrmSyncConfig> } | null)?.crm ?? {};
    return {
      syncEnabled: crm.syncEnabled ?? false,
      direction: 'push',
      fieldMapping: crm.fieldMapping ?? CRM_PROVIDERS[provider]?.defaultMapping ?? {},
    };
  }

  /** The catalog the mapping UI needs: mappable Vertex fields + defaults. */
  meta(provider: string) {
    return {
      vertexFields: MAPPABLE_VERTEX_FIELDS,
      defaultMapping: CRM_PROVIDERS[provider]?.defaultMapping ?? {},
    };
  }

  async saveConfig(
    tenant: TenantContext,
    provider: string,
    input: { syncEnabled?: boolean; fieldMapping?: FieldMapping },
  ): Promise<CrmSyncConfig> {
    if (!this.isCrmProvider(provider)) {
      throw new BadRequestException(`${provider} does not support CRM sync.`);
    }
    const conn = await this.db.integrationConnection.findFirst({ where: { provider } });
    if (!conn) throw new NotFoundException(`${provider} is not connected.`);

    const current = (conn.config as Record<string, unknown> | null) ?? {};
    const currentCrm = (current.crm as Partial<CrmSyncConfig>) ?? {};
    const nextCrm: CrmSyncConfig = {
      syncEnabled: input.syncEnabled ?? currentCrm.syncEnabled ?? false,
      direction: 'push',
      fieldMapping:
        input.fieldMapping ?? currentCrm.fieldMapping ?? CRM_PROVIDERS[provider].defaultMapping,
    };
    await this.db.integrationConnection.update({
      where: { id: conn.id },
      data: { config: { ...current, crm: nextCrm } as never },
    });
    await this.audit.log(tenant, 'crm.sync_config_updated', {
      targetType: 'integration', targetId: provider, metadata: { syncEnabled: nextCrm.syncEnabled },
    });
    return nextCrm;
  }

  // ------------------------------------------------------------------- events

  /**
   * Reacts to a domain event. On lead.created, pushes the lead to every
   * connected CRM whose sync is enabled. Best-effort — never blocks the event.
   */
  async onEvent(orgId: string, event: string, data: unknown): Promise<void> {
    if (event !== 'lead.created') return;
    const leadId = (data as { leadId?: string })?.leadId;
    if (!leadId) return;

    const connections = await this.db.integrationConnection.findMany({
      where: { orgId, status: 'CONNECTED', deletedAt: null },
      select: { provider: true, config: true },
    });
    for (const c of connections) {
      if (!this.isCrmProvider(c.provider)) continue;
      const crm = (c.config as { crm?: Partial<CrmSyncConfig> } | null)?.crm;
      if (!crm?.syncEnabled) continue;
      await this.syncLead(orgId, c.provider, leadId).catch((err) =>
        this.logger.warn(`crm sync (${c.provider}) failed: ${(err as Error).message}`),
      );
    }
  }

  // --------------------------------------------------------------------- sync

  /**
   * Pushes one lead to the external CRM: maps fields, then creates or updates
   * the contact (idempotent via the sync record). Records the outcome.
   */
  async syncLead(orgId: string, provider: string, leadId: string) {
    const lead = await this.db.lead.findFirst({
      where: { id: leadId, orgId },
      select: { id: true, name: true, email: true, phone: true, company: true, source: true, temperature: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const cfg = await this.getConfig(orgId, provider);
    const props = applyMapping(lead as SyncableLead, cfg.fieldMapping);
    if (Object.keys(props).length === 0) {
      throw new BadRequestException('Nothing to sync — the field mapping produced no values.');
    }

    const existing = await this.db.crmSyncRecord.findFirst({
      where: { orgId, provider, entityType: 'lead', entityId: leadId },
      select: { id: true, externalId: true },
    });

    try {
      const token = await this.oauth.getAccessToken(orgId, provider);
      const connector = this.connectorFor(provider);
      const result = existing?.externalId
        ? await connector.updateContact(token, existing.externalId, props)
        : await connector.createContact(token, props);

      const record = await this.recordResult(orgId, provider, leadId, {
        externalId: result.externalId,
        status: 'SYNCED',
        error: null,
      });
      await this.db.integrationConnection.updateMany({
        where: { orgId, provider },
        data: { lastSyncAt: new Date(), lastError: null },
      });
      return { ok: true as const, externalId: result.externalId, created: !existing?.externalId, record };
    } catch (err) {
      const message = (err as Error).message.slice(0, 500);
      await this.recordResult(orgId, provider, leadId, {
        externalId: existing?.externalId ?? null,
        status: 'FAILED',
        error: message,
      });
      await this.db.integrationConnection.updateMany({
        where: { orgId, provider },
        data: { lastError: message },
      });
      throw err;
    }
  }

  private async recordResult(
    orgId: string,
    provider: string,
    leadId: string,
    data: { externalId: string | null; status: 'SYNCED' | 'FAILED'; error: string | null },
  ) {
    const existing = await this.db.crmSyncRecord.findFirst({
      where: { orgId, provider, entityType: 'lead', entityId: leadId },
      select: { id: true },
    });
    if (existing) {
      return this.db.crmSyncRecord.update({
        where: { id: existing.id },
        data: { ...data, syncedAt: new Date() },
      });
    }
    return this.db.crmSyncRecord.create({
      data: { orgId, provider, entityType: 'lead', entityId: leadId, direction: 'push', ...data },
    });
  }

  // ------------------------------------------------------------- manual + log

  /** Manually syncs the org's most recent leads (section 14 "Sync now"). */
  async syncNow(tenant: TenantContext, provider: string, limit = 50) {
    if (!this.isCrmProvider(provider)) {
      throw new BadRequestException(`${provider} does not support CRM sync.`);
    }
    const leads = await this.db.lead.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      select: { id: true },
    });
    let synced = 0;
    let failed = 0;
    for (const l of leads) {
      try {
        await this.syncLead(tenant.orgId, provider, l.id);
        synced += 1;
      } catch {
        failed += 1;
      }
    }
    await this.audit.log(tenant, 'crm.sync_now', {
      targetType: 'integration', targetId: provider, metadata: { synced, failed },
    });
    return { synced, failed, total: leads.length };
  }

  /** The sync log for a provider (org-scoped). */
  records(tenant: TenantContext, provider: string) {
    return this.db.crmSyncRecord.findMany({
      where: { provider },
      orderBy: { syncedAt: 'desc' },
      take: 100,
    });
  }
}
