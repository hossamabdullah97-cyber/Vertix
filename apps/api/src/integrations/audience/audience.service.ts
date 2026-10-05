import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../../prisma/prisma.service';
import { CredentialVault } from '../credential-vault.service';
import { AuditService } from '../../organizations/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  ActiveCampaignConnector,
  AudienceError,
  BrevoConnector,
  KlaviyoConnector,
  activeCampaignBase,
  splitName,
  toE164,
  type AudienceConnector,
  type AudienceContact,
  type AudienceCredentials,
  type AudienceList,
  type AudienceProvider,
} from './audience-connectors';

interface AudienceConfig {
  listId: string;
  listName: string;
  /** Add each new lead as it arrives. */
  autoSync: boolean;
}

const NAMES: Record<AudienceProvider, string> = { brevo: 'Brevo', activecampaign: 'ActiveCampaign', klaviyo: 'Klaviyo' };
/** How many of the newest leads "Add recent leads" sends. */
const RECENT = 200;

/**
 * Adds a workspace's leads to a list in its email-marketing tool (Brevo,
 * ActiveCampaign, Klaviyo): each new lead as it arrives, or the recent ones on
 * request. The key is checked and kept encrypted; each lead's outcome is kept
 * as a sync record, so the same person is never sent twice for no reason and
 * the settings can say how it went.
 */
@Injectable()
export class AudienceService {
  private readonly logger = new Logger(AudienceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly vault: CredentialVault,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private aad(orgId: string, provider: string) {
    return `audience:${orgId}:${provider}`;
  }

  /** The connector for these credentials; a bad ActiveCampaign URL is refused before anything is called. */
  connector(provider: AudienceProvider, creds: AudienceCredentials): AudienceConnector {
    const key = creds.apiKey.trim();
    if (provider === 'brevo') return new BrevoConnector(key, this.config.get<string>('BREVO_API_URL') || undefined);
    if (provider === 'klaviyo') return new KlaviyoConnector(key, this.config.get<string>('KLAVIYO_API_URL') || undefined);
    const base = this.config.get<string>('ACTIVECAMPAIGN_API_URL') || activeCampaignBase(creds.accountUrl);
    if (!base) throw new BadRequestException('Paste the API URL from ActiveCampaign (Settings → Developer), like https://youraccount.api-us1.com.');
    return new ActiveCampaignConnector(key, base, creds.accountUrl?.trim());
  }

  private refused(provider: AudienceProvider, err: unknown): never {
    if (err instanceof AudienceError) {
      if (err.status === 401 || err.status === 403) throw new BadRequestException(`${NAMES[provider]} did not accept this key. Copy it again, with access to contacts and lists.`);
      throw new BadRequestException(`${NAMES[provider]} could not be reached or refused the request (${err.message}).`);
    }
    throw err;
  }

  // ------------------------------------------------------------- setting up

  /** Checks a key and lists the account's lists, to choose one. */
  async check(provider: AudienceProvider, creds: AudienceCredentials): Promise<{ account: string; lists: AudienceList[] }> {
    if (!creds.apiKey?.trim()) throw new BadRequestException('Paste the API key.');
    const c = this.connector(provider, creds);
    try {
      return { account: await c.account(), lists: await c.lists() };
    } catch (err) {
      this.refused(provider, err);
    }
  }

  async connect(tenant: TenantContext, provider: AudienceProvider, input: AudienceCredentials & { listId: string; listName?: string; autoSync?: boolean }) {
    if (!this.vault.enabled) throw new BadRequestException('Saving connections is not set up on this server yet.');
    const { account, lists } = await this.check(provider, input);
    const list = lists.find((l) => l.id === input.listId);
    if (!list) throw new BadRequestException('Choose one of the account’s lists.');
    const creds: AudienceCredentials = { apiKey: input.apiKey.trim(), ...(provider === 'activecampaign' ? { accountUrl: input.accountUrl?.trim() } : {}) };
    const config: AudienceConfig = { listId: list.id, listName: list.name, autoSync: input.autoSync ?? true };
    const data = {
      status: 'CONNECTED' as const,
      credentials: this.vault.encryptJson(creds, this.aad(tenant.orgId, provider)),
      config: config as never,
      externalAccountName: account.slice(0, 120),
      lastError: null,
      deletedAt: null,
    };
    const existing = await this.db.integrationConnection.findFirst({ where: { provider, userId: null } });
    if (existing) await this.db.integrationConnection.update({ where: { id: existing.id }, data });
    else await this.db.integrationConnection.create({ data: { orgId: tenant.orgId, provider, ...data } });
    await this.audit.log(tenant, 'integration.connected', { targetType: 'integration', targetId: provider });
    return this.settings(provider);
  }

  private async connection(provider: AudienceProvider) {
    const conn = await this.db.integrationConnection.findFirst({ where: { provider, userId: null, status: { in: ['CONNECTED', 'ERROR'] } } });
    if (!conn?.credentials) throw new NotFoundException(`${provider} is not connected.`);
    return conn as typeof conn & { credentials: string };
  }

  private creds(orgId: string, provider: AudienceProvider, token: string) {
    return this.vault.decryptJson<AudienceCredentials>(token, this.aad(orgId, provider));
  }

  /** The list, whether new leads go there, and how sending has gone. */
  async settings(provider: AudienceProvider) {
    const conn = await this.db.integrationConnection.findFirst({ where: { provider, userId: null } });
    const config = (conn?.config ?? {}) as Partial<AudienceConfig>;
    const records = conn
      ? await this.db.crmSyncRecord.groupBy({ by: ['status'], where: { orgId: conn.orgId, provider, entityType: 'lead' }, _count: { _all: true } })
      : [];
    const count = (s: string) => records.find((r) => r.status === s)?._count._all ?? 0;
    return {
      connected: conn?.status === 'CONNECTED',
      status: conn?.status ?? 'DISCONNECTED',
      account: conn?.externalAccountName ?? null,
      listId: config.listId ?? null,
      listName: config.listName ?? null,
      autoSync: config.autoSync ?? true,
      lastError: conn?.lastError ?? null,
      lastSyncAt: conn?.lastSyncAt ?? null,
      sent: { synced: count('SYNCED'), failed: count('FAILED'), skipped: count('SKIPPED') },
    };
  }

  /** The connected account's lists, to move to another. */
  async connectedLists(provider: AudienceProvider) {
    const conn = await this.connection(provider);
    try {
      return await this.connector(provider, this.creds(conn.orgId, provider, conn.credentials)).lists();
    } catch (err) {
      this.refused(provider, err);
    }
  }

  async updateSettings(tenant: TenantContext, provider: AudienceProvider, input: { listId?: string; autoSync?: boolean }) {
    const conn = await this.connection(provider);
    const config = { ...((conn.config ?? {}) as unknown as AudienceConfig) };
    if (input.listId !== undefined && input.listId !== config.listId) {
      const list = (await this.connectedLists(provider)).find((l) => l.id === input.listId);
      if (!list) throw new BadRequestException('Choose one of the account’s lists.');
      config.listId = list.id;
      config.listName = list.name;
    }
    if (input.autoSync !== undefined) config.autoSync = input.autoSync;
    await this.db.integrationConnection.update({ where: { id: conn.id }, data: { config: config as never } });
    await this.audit.log(tenant, 'integration.settings_changed', { targetType: 'integration', targetId: provider });
    return this.settings(provider);
  }

  // ------------------------------------------------------------- sending

  /** Each new lead, as it arrives, to every tool that adds them automatically. Best-effort. */
  async onEvent(orgId: string, event: string, data: unknown): Promise<void> {
    if (event !== 'lead.created') return;
    const leadId = (data as { leadId?: string } | null)?.leadId;
    if (!leadId) return;
    const connections = await this.db.integrationConnection.findMany({
      where: { orgId, provider: { in: ['brevo', 'activecampaign', 'klaviyo'] }, userId: null, status: 'CONNECTED', deletedAt: null },
      select: { id: true, provider: true, config: true, credentials: true },
    });
    for (const conn of connections) {
      const config = (conn.config ?? {}) as unknown as AudienceConfig;
      if (!conn.credentials || !config.autoSync || !config.listId) continue;
      const provider = conn.provider as AudienceProvider;
      try {
        const connector = this.connector(provider, this.creds(orgId, provider, conn.credentials));
        await this.send(orgId, conn.id, provider, connector, config.listId, leadId);
      } catch (err) {
        this.logger.warn(`${provider} sync failed for ${orgId}: ${(err as Error).message}`);
      }
    }
  }

  /** The newest leads, now: for leads that came before connecting, or after a fix. */
  async syncRecent(tenant: TenantContext, provider: AudienceProvider) {
    const conn = await this.connection(provider);
    const config = conn.config as unknown as AudienceConfig;
    const connector = this.connector(provider, this.creds(conn.orgId, provider, conn.credentials));
    const leads = await this.db.lead.findMany({ orderBy: { createdAt: 'desc' }, take: RECENT, select: { id: true } });
    const tally = { synced: 0, failed: 0, skipped: 0 };
    for (const l of leads) {
      const outcome = await this.send(tenant.orgId, conn.id, provider, connector, config.listId, l.id);
      tally[outcome] += 1;
      // A key that stopped working fails every lead the same way: stop at the first.
      if (outcome === 'failed' && (await this.db.integrationConnection.findFirst({ where: { id: conn.id }, select: { status: true } }))?.status === 'ERROR') break;
    }
    await this.audit.log(tenant, 'crm.sync_now', { targetType: 'integration', targetId: provider, metadata: tally });
    return { ...tally, total: leads.length };
  }

  /** One lead to one tool, and its outcome kept. */
  private async send(orgId: string, connId: string, provider: AudienceProvider, connector: AudienceConnector, listId: string, leadId: string): Promise<'synced' | 'failed' | 'skipped'> {
    const lead = await this.db.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true, name: true, email: true, phone: true, company: true } });
    if (!lead) return 'skipped';
    const contact: AudienceContact = {
      email: lead.email?.trim().toLowerCase() || null,
      ...splitName(lead.name),
      ...(toE164(lead.phone) ? { phone: toE164(lead.phone) } : {}),
      ...(lead.company?.trim() ? { company: lead.company.trim() } : {}),
    };
    if (!connector.accepts(contact)) {
      await this.record(orgId, provider, leadId, { externalId: null, status: 'SKIPPED', error: 'No email address' });
      return 'skipped';
    }
    try {
      const externalId = await connector.upsert(contact, listId);
      await this.record(orgId, provider, leadId, { externalId, status: 'SYNCED', error: null });
      await this.db.integrationConnection.update({ where: { id: connId }, data: { lastSyncAt: new Date(), lastError: null } });
      return 'synced';
    } catch (err) {
      const message = (err as Error).message.slice(0, 500);
      await this.record(orgId, provider, leadId, { externalId: null, status: 'FAILED', error: message });
      const status = err instanceof AudienceError ? err.status : 0;
      if (status === 401 || status === 403) await this.markBroken(orgId, connId, provider, message);
      else await this.db.integrationConnection.update({ where: { id: connId }, data: { lastError: message } });
      return 'failed';
    }
  }

  private async record(orgId: string, provider: string, leadId: string, data: { externalId: string | null; status: 'SYNCED' | 'FAILED' | 'SKIPPED'; error: string | null }) {
    await this.db.crmSyncRecord.upsert({
      where: { orgId_provider_entityType_entityId: { orgId, provider, entityType: 'lead', entityId: leadId } },
      create: { orgId, provider, entityType: 'lead', entityId: leadId, direction: 'push', ...data },
      update: { ...data, syncedAt: new Date() },
    });
  }

  /** The key stopped working: marked so, and the admins told once. */
  private async markBroken(orgId: string, connId: string, provider: AudienceProvider, message: string) {
    const marked = await this.db.integrationConnection.updateMany({ where: { id: connId, status: 'CONNECTED' }, data: { status: 'ERROR', lastError: message } });
    if (marked.count === 0) return;
    await this.notifications.notifyOrgAdmins(orgId, null, {
      type: 'integration.failed',
      category: 'SYSTEM',
      priority: 'HIGH',
      title: `${NAMES[provider]} stopped accepting new leads`,
      body: 'Connect it again from Integrations.',
      metadata: { provider, detail: message },
    });
  }
}
