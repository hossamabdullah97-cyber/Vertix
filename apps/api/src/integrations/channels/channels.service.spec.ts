import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelsService, chatsFrom, isTeamsUrl } from './channels.service';

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawQ';
const TEAMS = 'https://prod-12.westeurope.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=x';

/** A stand-in for fetch: answers by URL, and keeps what was sent. */
function fakeFetch(answer: (url: string) => { status: number; body?: unknown }) {
  const sent: { url: string; body: Record<string, unknown> | null }[] = [];
  const fn = jest.fn(async (url: string, init?: RequestInit) => {
    sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const a = answer(url);
    const text = JSON.stringify(a.body ?? {});
    return { status: a.status, text: async () => text, json: async () => a.body ?? {} } as unknown as Response;
  });
  global.fetch = fn as unknown as typeof fetch;
  return sent;
}

function setup(connections: Record<string, unknown>[] = []) {
  const rows = connections.map((c) => ({ ...c }));
  const db = {
    integrationConnection: {
      findMany: jest.fn(async () => rows),
      findFirst: jest.fn(async () => rows[0] ?? null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new', ...data })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(rows[0] ?? {}, data)),
      updateMany: jest.fn(async ({ where, data }: { where: { status?: string }; data: Record<string, unknown> }) => {
        const r = rows[0];
        if (!r || (where.status && r.status !== where.status)) return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      }),
    },
  };
  const vault = { enabled: true, encryptJson: jest.fn((v: unknown) => `enc:${JSON.stringify(v)}`), decryptJson: jest.fn((t: string) => JSON.parse(t.slice(4))) };
  const audit = { log: jest.fn(async () => undefined) };
  const notifications = { notifyOrgAdmins: jest.fn(async (_orgId: string, _actor: string | null, _input: Record<string, unknown>) => undefined) };
  const service = new ChannelsService(
    { client: db } as never,
    new ConfigService({ APP_PUBLIC_URL: 'https://app.example', DEFAULT_TIMEZONE: 'Africa/Cairo' }),
    vault as never,
    audit as never,
    notifications as never,
  );
  return { service, db, rows, notifications, vault };
}

const tenant = { orgId: 'org1', userId: 'u1', role: 'OWNER' } as never;
const telegramRow = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  orgId: 'org1',
  provider: 'telegram',
  status: 'CONNECTED',
  credentials: `enc:${JSON.stringify({ botToken: TOKEN })}`,
  config: { events: ['lead.created'], lang: 'ar', chatId: '-100555' },
  ...over,
});

afterEach(() => jest.restoreAllMocks());

describe('Teams links', () => {
  it('takes a Workflows or incoming-webhook link, and nothing else', () => {
    expect(isTeamsUrl(TEAMS)).toBe(true);
    expect(isTeamsUrl('https://contoso.webhook.office.com/webhookb2/abc')).toBe(true);
    expect(isTeamsUrl('https://default1234.ab.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/x')).toBe(true);
    expect(isTeamsUrl('http://prod-12.westeurope.logic.azure.com/x')).toBe(false);
    expect(isTeamsUrl('https://evil.example/logic.azure.com')).toBe(false);
    expect(isTeamsUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isTeamsUrl('not a link')).toBe(false);
  });
});

describe('picking the Telegram chat', () => {
  it('lists the chats the bot heard from, newest first, each once', () => {
    expect(
      chatsFrom([
        { message: { chat: { id: -100555, title: 'Sales Cairo', type: 'supergroup' } } },
        { my_chat_member: { chat: { id: 42, first_name: 'Hossam', last_name: 'A', type: 'private' } } },
        { message: { chat: { id: -100555, title: 'Sales Cairo', type: 'supergroup' } } },
        { channel_post: { chat: { id: -100777, title: 'Leads', type: 'channel' } } },
        { update_id: 9 },
      ]),
    ).toEqual([
      { id: '-100777', title: 'Leads', type: 'channel' },
      { id: '-100555', title: 'Sales Cairo', type: 'supergroup' },
      { id: '42', title: 'Hossam A', type: 'private' },
    ]);
  });

  it('turns away a token that is not one, without asking Telegram', async () => {
    const sent = fakeFetch(() => ({ status: 200 }));
    await expect(setup().service.telegramChats('hello')).rejects.toBeInstanceOf(BadRequestException);
    expect(sent).toHaveLength(0);
  });

  it('says so when Telegram does not know the token', async () => {
    fakeFetch(() => ({ status: 401, body: { ok: false, description: 'Unauthorized' } }));
    await expect(setup().service.telegramChats(TOKEN)).rejects.toThrow(/does not know this token/);
  });

  it('gives the bot and its chats', async () => {
    fakeFetch((url) =>
      url.endsWith('/getMe')
        ? { status: 200, body: { ok: true, result: { username: 'vertex_sales_bot' } } }
        : { status: 200, body: { ok: true, result: [{ message: { chat: { id: -1001, title: 'Booth', type: 'group' } } }] } },
    );
    await expect(setup().service.telegramChats(TOKEN)).resolves.toEqual({ bot: 'vertex_sales_bot', chats: [{ id: '-1001', title: 'Booth', type: 'group' }] });
  });
});

describe('connecting', () => {
  it('keeps the bot only after its first message arrived, encrypted', async () => {
    const sent = fakeFetch(() => ({ status: 200, body: { ok: true } }));
    const { service, db, vault } = setup();
    await service.connect(tenant, 'telegram', { botToken: TOKEN, chatId: '-1001', chatTitle: 'Booth', lang: 'ar', events: ['lead.created', 'nonsense'] });
    expect(sent[0].url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(String(sent[0].body?.text)).toContain('تم ربط Vertex Connect');
    expect(vault.encryptJson).toHaveBeenCalledWith({ botToken: TOKEN }, 'channel:org1:telegram');
    const data = db.integrationConnection.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ status: 'CONNECTED', externalAccountName: 'Booth', config: { events: ['lead.created'], lang: 'ar', chatId: '-1001' } });
    expect(data.credentials).toBe(vault.encryptJson.mock.results[0].value);
  });

  it('keeps nothing when the bot cannot post there, and says why', async () => {
    fakeFetch(() => ({ status: 403, body: { ok: false, description: 'Forbidden: bot is not a member of the supergroup chat' } }));
    const { service, db } = setup();
    await expect(service.connect(tenant, 'telegram', { botToken: TOKEN, chatId: '-1001', lang: 'en' })).rejects.toThrow(/Add it to the group/);
    expect(db.integrationConnection.create).not.toHaveBeenCalled();
  });

  it('takes a Teams workflow link that answers, and refuses any other address', async () => {
    const sent = fakeFetch(() => ({ status: 202 }));
    const { service, db } = setup();
    await expect(service.connect(tenant, 'ms_teams', { url: 'https://example.com/hook', lang: 'en' })).rejects.toBeInstanceOf(BadRequestException);
    expect(sent).toHaveLength(0);
    await service.connect(tenant, 'ms_teams', { url: TEAMS, lang: 'en' });
    expect(sent[0].url).toBe(TEAMS);
    expect((sent[0].body as { attachments: unknown[] }).attachments).toHaveLength(1);
    expect(db.integrationConnection.create).toHaveBeenCalled();
  });
});

describe('telling the channel', () => {
  const lead = { leadId: 'lead1', name: 'Laila', phone: '0100', cardSlug: 'mariam', intent: 'CONTACT' };

  it('posts a new lead to the chat, in the language it was set up with', async () => {
    const sent = fakeFetch(() => ({ status: 200, body: { ok: true } }));
    const { service, db } = setup([telegramRow()]);
    await service.onEvent('org1', 'lead.created', lead);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatchObject({ chat_id: '-100555' });
    expect(String(sent[0].body?.text)).toContain('<b>عميل جديد</b>');
    expect(db.integrationConnection.update.mock.calls[0][0].data).toMatchObject({ lastError: null });
  });

  it('stays quiet about what it did not ask for', async () => {
    const sent = fakeFetch(() => ({ status: 200, body: { ok: true } }));
    const { service } = setup([telegramRow()]);
    await service.onEvent('org1', 'nfc.tapped', { tagUid: 'X' });
    await service.onEvent('org1', 'meeting.requested', lead);
    expect(sent).toHaveLength(0);
  });

  it('marks a chat the bot was removed from as broken, and tells the admins once', async () => {
    fakeFetch(() => ({ status: 403, body: { ok: false, description: 'Forbidden: bot was kicked from the group chat' } }));
    const { service, rows, notifications } = setup([telegramRow()]);
    await service.onEvent('org1', 'lead.created', lead);
    expect(rows[0]).toMatchObject({ status: 'ERROR', lastError: 'Forbidden: bot was kicked from the group chat' });
    expect(notifications.notifyOrgAdmins).toHaveBeenCalledTimes(1);
    expect(notifications.notifyOrgAdmins.mock.calls[0][2]).toMatchObject({ type: 'integration.failed', metadata: { provider: 'telegram' } });
    // A second event in the same moment does not tell them again.
    await service.onEvent('org1', 'lead.created', lead);
    expect(notifications.notifyOrgAdmins).toHaveBeenCalledTimes(1);
  });

  it('keeps a channel connected through a busy or unreachable moment', async () => {
    fakeFetch(() => ({ status: 429, body: { ok: false, description: 'Too Many Requests: retry after 5' } }));
    const { service, rows, notifications } = setup([telegramRow()]);
    await service.onEvent('org1', 'lead.created', lead);
    expect(rows[0]).toMatchObject({ status: 'CONNECTED', lastError: 'Too Many Requests: retry after 5' });
    expect(notifications.notifyOrgAdmins).not.toHaveBeenCalled();
  });
});
