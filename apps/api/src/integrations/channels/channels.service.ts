import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../../prisma/prisma.service';
import { CredentialVault } from '../credential-vault.service';
import { AuditService } from '../../organizations/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  CHANNEL_EVENTS,
  DEFAULT_CHANNEL_EVENTS,
  channelMessage,
  telegramBody,
  teamsBody,
  testMessage,
  wants,
  type ChannelLang,
  type ChannelMessage,
} from './channel-message';

/**
 * Telegram and Microsoft Teams: a chat or a channel the workspace's news is
 * posted to. Nothing to register with us first; the workspace brings its own
 * bot (Telegram) or a Workflows link (Teams), which is checked by sending a
 * message before it is kept, and kept encrypted.
 */
export const CHANNEL_PROVIDERS = ['telegram', 'ms_teams'] as const;
export type ChannelProvider = (typeof CHANNEL_PROVIDERS)[number];
export const isChannelProvider = (p: string): p is ChannelProvider => (CHANNEL_PROVIDERS as readonly string[]).includes(p);

interface TelegramCredentials {
  botToken: string;
}
interface TeamsCredentials {
  url: string;
}
interface ChannelConfig {
  events: string[];
  lang: ChannelLang;
  chatId?: string;
}

export interface TelegramChat {
  id: string;
  title: string;
  type: string;
}

/** What one send came to: delivered, or why not, and whether trying again could help. */
interface Sent {
  ok: boolean;
  status: number;
  detail: string;
  /** The bot or the link no longer works: it stays broken until someone fixes it. */
  broken: boolean;
}

const TIMEOUT_MS = 10_000;
const BOT_TOKEN = /^\d{5,}:[\w-]{30,}$/;

/**
 * Where a Teams link may point: Microsoft's Workflows (Power Automate) and the
 * older incoming webhooks. Nowhere else, so a link cannot be used to make this
 * server call an address of someone's choosing.
 */
const TEAMS_HOSTS = ['.logic.azure.com', '.powerplatform.com', '.webhook.office.com'];
export function isTeamsUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return u.protocol === 'https:' && !u.username && !u.password && TEAMS_HOSTS.some((h) => u.hostname.endsWith(h));
}

/** The chats a bot has heard from (getUpdates), newest first, each once. */
export function chatsFrom(updates: unknown[]): TelegramChat[] {
  const seen = new Map<string, TelegramChat>();
  for (const u of [...updates].reverse()) {
    const x = u as Record<string, { chat?: { id?: number | string; title?: string; first_name?: string; last_name?: string; username?: string; type?: string } }>;
    const chat = (x.message ?? x.channel_post ?? x.my_chat_member ?? x.edited_message ?? x.edited_channel_post)?.chat;
    if (!chat?.id) continue;
    const id = String(chat.id);
    if (seen.has(id)) continue;
    const title = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || (chat.username ? `@${chat.username}` : id);
    seen.set(id, { id, title, type: chat.type ?? 'private' });
  }
  return [...seen.values()];
}

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

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
    return `channel:${orgId}:${provider}`;
  }

  private get telegramApi() {
    return (this.config.get<string>('TELEGRAM_API_URL') || 'https://api.telegram.org').replace(/\/$/, '');
  }

  private get appUrl() {
    return this.config.get<string>('APP_PUBLIC_URL') || 'http://localhost:3000';
  }

  private get timeZone() {
    return this.config.get<string>('DEFAULT_TIMEZONE') || 'Africa/Cairo';
  }

  // ------------------------------------------------------------- sending

  private async post(url: string, body: unknown): Promise<{ status: number; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'VertexConnect/1' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return { status: res.status, text: (await res.text().catch(() => '')).slice(0, 500) };
    } finally {
      clearTimeout(timer);
    }
  }

  private async send(provider: ChannelProvider, creds: TelegramCredentials | TeamsCredentials, config: ChannelConfig, m: ChannelMessage): Promise<Sent> {
    try {
      if (provider === 'telegram') {
        const { status, text } = await this.post(`${this.telegramApi}/bot${(creds as TelegramCredentials).botToken}/sendMessage`, telegramBody(config.chatId ?? '', m));
        let description = '';
        try {
          description = String((JSON.parse(text) as { description?: string }).description ?? '');
        } catch {
          /* not JSON */
        }
        // 401: the token was revoked. 403: the bot was removed from the chat. 400: the chat is gone.
        return { ok: status >= 200 && status < 300, status, detail: description || `HTTP ${status}`, broken: [400, 401, 403, 404].includes(status) };
      }
      const { status } = await this.post((creds as TeamsCredentials).url, teamsBody(m, config.lang));
      // A deleted or switched-off workflow answers 4xx (often 404 or 401); 429 and 5xx pass.
      return { ok: status >= 200 && status < 300, status, detail: `HTTP ${status}`, broken: status >= 400 && status < 500 && status !== 408 && status !== 429 };
    } catch (err) {
      const reason = (err as Error).name === 'AbortError' ? 'No answer in time' : (err as Error).message;
      return { ok: false, status: 0, detail: reason, broken: false };
    }
  }

  // ------------------------------------------------------------- setting up

  /** Checks a bot token and lists the chats the bot has heard from, to pick one. */
  async telegramChats(botToken: string): Promise<{ bot: string; chats: TelegramChat[] }> {
    const token = botToken.trim();
    if (!BOT_TOKEN.test(token)) throw new BadRequestException('That does not look like a bot token. Copy it from @BotFather.');
    const call = async (method: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${this.telegramApi}/bot${token}/${method}`, { signal: controller.signal });
        return { status: res.status, body: (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; description?: string } };
      } catch {
        throw new BadRequestException('Telegram could not be reached. Try again in a moment.');
      } finally {
        clearTimeout(timer);
      }
    };
    const me = await call('getMe');
    if (me.status === 401 || me.status === 404) throw new BadRequestException('Telegram does not know this token. Copy it again from @BotFather.');
    if (!me.body.ok) throw new BadRequestException(me.body.description || 'Telegram refused the token.');
    const bot = (me.body.result as { username?: string } | undefined)?.username ?? '';
    const updates = await call('getUpdates');
    if (updates.status === 409) throw new BadRequestException('This bot already sends its messages to another service (a webhook), so its chats cannot be listed. Use a new bot.');
    return { bot, chats: updates.body.ok && Array.isArray(updates.body.result) ? chatsFrom(updates.body.result) : [] };
  }

  /**
   * Connects a provider: sends a first message there, and keeps the
   * credentials only when it arrived.
   */
  async connect(
    tenant: TenantContext,
    provider: ChannelProvider,
    input: { botToken?: string; chatId?: string; chatTitle?: string; url?: string; lang: ChannelLang; events?: string[] },
  ) {
    if (!this.vault.enabled) throw new BadRequestException('Saving connections is not set up on this server yet.');
    const config: ChannelConfig = { events: this.cleanEvents(input.events), lang: input.lang };
    let creds: TelegramCredentials | TeamsCredentials;
    let account: string;
    if (provider === 'telegram') {
      const botToken = input.botToken?.trim() ?? '';
      if (!BOT_TOKEN.test(botToken)) throw new BadRequestException('That does not look like a bot token. Copy it from @BotFather.');
      if (!input.chatId?.trim()) throw new BadRequestException('Choose the chat to post to.');
      creds = { botToken };
      config.chatId = input.chatId.trim();
      account = input.chatTitle?.trim().slice(0, 120) || config.chatId;
    } else {
      const url = input.url?.trim() ?? '';
      if (!isTeamsUrl(url)) throw new BadRequestException('Paste the link from a Teams workflow ("When a Teams webhook request is received").');
      creds = { url };
      account = 'Microsoft Teams';
    }

    const sent = await this.send(provider, creds, config, testMessage(config.lang, this.appUrl));
    if (!sent.ok) throw new BadRequestException(this.whyNot(provider, sent));

    const data = {
      status: 'CONNECTED' as const,
      credentials: this.vault.encryptJson(creds, this.aad(tenant.orgId, provider)),
      config: config as never,
      externalAccountName: account,
      lastError: null,
      lastSyncAt: new Date(),
      deletedAt: null,
    };
    // orgId is injected by the tenant layer.
    const existing = await this.db.integrationConnection.findFirst({ where: { provider, userId: null } });
    if (existing) await this.db.integrationConnection.update({ where: { id: existing.id }, data });
    else await this.db.integrationConnection.create({ data: { orgId: tenant.orgId, provider, ...data } });
    await this.audit.log(tenant, 'integration.connected', { targetType: 'integration', targetId: provider });
    return this.settings(provider);
  }

  /** What a connected channel is told, and in which language. */
  async settings(provider: ChannelProvider) {
    const conn = await this.db.integrationConnection.findFirst({ where: { provider, userId: null } });
    const config = (conn?.config ?? {}) as Partial<ChannelConfig>;
    return {
      connected: conn?.status === 'CONNECTED',
      status: conn?.status ?? 'DISCONNECTED',
      account: conn?.externalAccountName ?? null,
      lastError: conn?.lastError ?? null,
      lastSentAt: conn?.lastSyncAt ?? null,
      events: config.events ?? DEFAULT_CHANNEL_EVENTS,
      lang: config.lang ?? 'en',
      available: CHANNEL_EVENTS,
    };
  }

  async updateSettings(tenant: TenantContext, provider: ChannelProvider, input: { events?: string[]; lang?: ChannelLang }) {
    const conn = await this.requireConnection(provider);
    const config = { ...((conn.config ?? {}) as unknown as ChannelConfig) };
    if (input.events) config.events = this.cleanEvents(input.events);
    if (input.lang) config.lang = input.lang;
    await this.db.integrationConnection.update({ where: { id: conn.id }, data: { config: config as never } });
    await this.audit.log(tenant, 'integration.settings_changed', { targetType: 'integration', targetId: provider });
    return this.settings(provider);
  }

  /** Sends the test message again; a channel that works again is connected again. */
  async test(provider: ChannelProvider) {
    const conn = await this.requireConnection(provider);
    if (!conn.credentials) throw new BadRequestException('Connect it again: its details were removed.');
    const creds = this.vault.decryptJson<TelegramCredentials | TeamsCredentials>(conn.credentials, this.aad(conn.orgId, provider));
    const config = conn.config as unknown as ChannelConfig;
    const sent = await this.send(provider, creds, config, testMessage(config.lang ?? 'en', this.appUrl));
    await this.db.integrationConnection.update({
      where: { id: conn.id },
      data: sent.ok ? { status: 'CONNECTED', lastError: null, lastSyncAt: new Date() } : { lastError: sent.detail },
    });
    if (!sent.ok) throw new BadRequestException(this.whyNot(provider, sent));
    return this.settings(provider);
  }

  private async requireConnection(provider: ChannelProvider) {
    const conn = await this.db.integrationConnection.findFirst({ where: { provider, userId: null, status: { in: ['CONNECTED', 'ERROR'] } } });
    if (!conn) throw new NotFoundException(`${provider} is not connected.`);
    return conn;
  }

  private cleanEvents(events: string[] | undefined): string[] {
    if (!events) return [...DEFAULT_CHANNEL_EVENTS];
    return [...new Set(events)].filter((e) => (CHANNEL_EVENTS as readonly string[]).includes(e));
  }

  private whyNot(provider: ChannelProvider, sent: Sent): string {
    if (provider === 'telegram') {
      if (sent.status === 401) return 'Telegram does not know this token any more. Copy it again from @BotFather.';
      if (sent.status === 403 || sent.status === 400) return `The bot cannot post in that chat (${sent.detail}). Add it to the group, or make it an admin of the channel.`;
    } else if (sent.status >= 400 && sent.status < 500) {
      return `Teams refused the message (${sent.detail}). Check that the workflow is turned on and the link is copied whole.`;
    }
    return `The message did not arrive (${sent.detail}). Try again in a moment.`;
  }

  // ------------------------------------------------------------- events

  /** Tells each connected channel in the workspace about an event it asked for. Best-effort. */
  async onEvent(orgId: string, event: string, data: unknown): Promise<void> {
    if (!(CHANNEL_EVENTS as readonly string[]).includes(event)) return;
    const connections = await this.db.integrationConnection.findMany({
      where: { orgId, provider: { in: [...CHANNEL_PROVIDERS] }, userId: null, status: 'CONNECTED', deletedAt: null },
      select: { id: true, provider: true, config: true, credentials: true },
    });
    for (const conn of connections) {
      const config = (conn.config ?? {}) as unknown as ChannelConfig;
      if (!conn.credentials || !wants(config.events ?? DEFAULT_CHANNEL_EVENTS, event)) continue;
      const m = channelMessage(event, (data ?? {}) as Record<string, unknown>, { lang: config.lang ?? 'en', appUrl: this.appUrl, timeZone: this.timeZone, workspace: orgId });
      if (!m) continue;
      const provider = conn.provider as ChannelProvider;
      let creds: TelegramCredentials | TeamsCredentials;
      try {
        creds = this.vault.decryptJson(conn.credentials, this.aad(orgId, provider));
      } catch (err) {
        this.logger.warn(`${provider} credentials could not be read for ${orgId}: ${(err as Error).message}`);
        continue;
      }
      const sent = await this.send(provider, creds, config, m);
      await this.record(orgId, conn.id, provider, event, sent);
    }
  }

  /** Keeps how the last send went; a channel that stopped working is marked so, and the admins told once. */
  private async record(orgId: string, id: string, provider: ChannelProvider, event: string, sent: Sent) {
    if (sent.ok) {
      await this.db.integrationConnection.update({ where: { id }, data: { lastSyncAt: new Date(), lastError: null } });
      return;
    }
    this.logger.warn(`${provider} send failed for ${orgId}: ${sent.detail}`);
    if (!sent.broken) {
      await this.db.integrationConnection.update({ where: { id }, data: { lastError: sent.detail } });
      return;
    }
    // Only the send that finds it working marks it broken, so the admins hear of it once.
    const marked = await this.db.integrationConnection.updateMany({
      where: { id, status: 'CONNECTED' },
      data: { status: 'ERROR', lastError: sent.detail },
    });
    if (marked.count === 0) return;
    await this.notifications.notifyOrgAdmins(orgId, null, {
      type: 'integration.failed',
      category: 'SYSTEM',
      priority: 'HIGH',
      title: `${provider === 'telegram' ? 'Telegram' : 'Microsoft Teams'} stopped receiving messages`,
      body: 'Connect it again from Integrations.',
      metadata: { provider, event, detail: sent.detail },
    });
  }
}
