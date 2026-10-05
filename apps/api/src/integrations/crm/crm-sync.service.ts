import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuthService } from '../oauth.service';
import { AuditService } from '../../organizations/audit.service';
import { HubSpotConnector } from './hubspot.connector';
import {
  ConnectorError,
  MailchimpConnector,
  PipedriveConnector,
  SalesforceConnector,
  ZohoConnector,
  type ConnectorAuth,
  type CrmConnector,
} from './connectors';
import {
  applyMapping,
  DEFAULT_HUBSPOT_MAPPING,
  DEFAULT_MAILCHIMP_MAPPING,
  DEFAULT_PIPEDRIVE_MAPPING,
  DEFAULT_SALESFORCE_MAPPING,
  DEFAULT_ZOHO_MAPPING,
  MAPPABLE_VERTEX_FIELDS,
  type FieldMapping,
  type SyncableLead,
} from './field-mapping';

/**
 * Providers that support lead sync, and their default field mapping. An
 * audience (Mailchimp) needs a list chosen, and an email for every lead.
 */
const CRM_PROVIDERS: Record<string, { defaultMapping: FieldMapping; audience?: true }> = {
  hubspot: { defaultMapping: DEFAULT_HUBSPOT_MAPPING },
  salesforce: { defaultMapping: DEFAULT_SALESFORCE_MAPPING },
  zoho_crm: { defaultMapping: DEFAULT_ZOHO_MAPPING },
  pipedrive: { defaultMapping: DEFAULT_PIPEDRIVE_MAPPING },
  mailchimp: { defaultMapping: DEFAULT_MAILCHIMP_MAPPING, audience: true },
};

export interface CrmSyncConfig {
  syncEnabled: boolean;
  direction: 'push'; // Vertex → External (one-way) for now
  fieldMapping: FieldMapping;
  /** Mailchimp: the audience leads join. */
  listId?: string | null;
  listName?: string | null;
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

  private connectorFor(provider: string): CrmConnector {
    switch (provider) {
      case 'hubspot':
        return new HubSpotConnector(this.config.get<string>('OAUTH_HUBSPOT_API_URL') || 'https://api.hubapi.com');
      case 'salesforce':
        return new SalesforceConnector();
      case 'zoho_crm':
        return new ZohoConnector();
      case 'pipedrive':
        return new PipedriveConnector();
      case 'mailchimp':
        return new MailchimpConnector();
      default:
        throw new BadRequestException(`${provider} is not a supported CRM connector.`);
    }
  }

  /** Whether the provider puts leads on a list the workspace chooses (Mailchimp). */
  isAudience(provider: string): boolean {
    return !!CRM_PROVIDERS[provider]?.audience;
  }

  /** The audiences of a connected Mailchimp account, to choose one. */
  async lists(tenant: TenantContext, provider: string) {
    if (!this.isAudience(provider)) throw new BadRequestException(`${provider} does not support CRM sync.`);
    const auth = await this.oauth.getAuth(tenant.orgId, provider);
    return (this.connectorFor(provider) as MailchimpConnector).lists(auth);
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
      ...(this.isAudience(provider) ? { listId: crm.listId ?? null, listName: crm.listName ?? null } : {}),
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
    input: { syncEnabled?: boolean; fieldMapping?: FieldMapping; listId?: string },
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
      ...(this.isAudience(provider) ? { listId: currentCrm.listId ?? null, listName: currentCrm.listName ?? null } : {}),
    };
    if (input.listId !== undefined && this.isAudience(provider)) {
      const list = (await this.lists(tenant, provider)).find((l) => l.id === input.listId);
      if (!list) throw new BadRequestException('Choose one of the account’s lists.');
      nextCrm.listId = list.id;
      nextCrm.listName = list.name;
    }
    if (nextCrm.syncEnabled && this.isAudience(provider) && !nextCrm.listId) {
      throw new BadRequestException('Choose the Mailchimp audience leads join.');
    }
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

    // An audience keeps people by their email: without one there is nothing to add.
    if (this.isAudience(provider) && !lead.email?.trim()) {
      const record = await this.recordResult(orgId, provider, leadId, { externalId: null, status: 'SKIPPED', error: 'No email address' });
      return { ok: true as const, skipped: true as const, externalId: null, created: false, record };
    }

    try {
      const connector = this.connectorFor(provider);
      const opts = { listId: cfg.listId ?? undefined };
      const push = (auth: ConnectorAuth) =>
        existing?.externalId ? connector.updateContact(auth, existing.externalId, props, opts) : connector.createContact(auth, props, opts);
      let result: { externalId: string };
      try {
        result = await push(await this.oauth.getAuth(orgId, provider));
      } catch (err) {
        // A session that ended early (Salesforce gives no expiry): refresh once and try again.
        if (!(err instanceof ConnectorError) || err.status !== 401) throw err;
        result = await push(await this.oauth.getAuth(orgId, provider, true));
      }

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
    data: { externalId: string | null; status: 'SYNCED' | 'FAILED' | 'SKIPPED'; error: string | null },
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
    let skipped = 0;
    for (const l of leads) {
      try {
        const r = await this.syncLead(tenant.orgId, provider, l.id);
        if ('skipped' in r) skipped += 1;
        else synced += 1;
      } catch {
        failed += 1;
      }
    }
    await this.audit.log(tenant, 'crm.sync_now', {
      targetType: 'integration', targetId: provider, metadata: { synced, failed, skipped },
    });
    return { synced, failed, skipped, total: leads.length };
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
