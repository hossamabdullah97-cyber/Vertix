import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudienceService } from './audience.service';

const tenant = { orgId: 'org1', userId: 'u1', role: 'OWNER' } as never;

/** A stand-in for fetch: answers by path, keeps what was sent. */
function fakeFetch(answer: (url: string, body: unknown) => { status: number; body?: unknown }) {
  const sent: { url: string; body: unknown }[] = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    sent.push({ url, body });
    const a = answer(url, body);
    return { status: a.status, text: async () => (a.body === undefined ? '' : JSON.stringify(a.body)) } as unknown as Response;
  }) as unknown as typeof fetch;
  return sent;
}

/** Brevo that knows one list and takes every contact. */
const brevoOk = (url: string) =>
  url.endsWith('/account') ? { status: 200, body: { companyName: 'Nile Co' } } : url.includes('/contacts/lists') ? { status: 200, body: { lists: [{ id: 12, name: 'Expo leads' }] } } : { status: 201, body: { id: 1 } };

function setup(opts: { conn?: Record<string, unknown> | null; leads?: Record<string, unknown>[] } = {}) {
  const conn = opts.conn === undefined ? null : opts.conn;
  const rows = conn ? [{ ...conn }] : [];
  const records: Record<string, unknown>[] = [];
  const leads = opts.leads ?? [];
  const db = {
    integrationConnection: {
      findFirst: jest.fn(async () => rows[0] ?? null),
      findMany: jest.fn(async () => rows),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => (rows.push({ id: 'new', ...data }), rows[0])),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(rows[0], data)),
      updateMany: jest.fn(async ({ where, data }: { where: { status?: string }; data: Record<string, unknown> }) => {
        if (!rows[0] || (where.status && rows[0].status !== where.status)) return { count: 0 };
        Object.assign(rows[0], data);
        return { count: 1 };
      }),
    },
    lead: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => leads.find((l) => l.id === where.id) ?? null),
      findMany: jest.fn(async () => leads.map((l) => ({ id: l.id }))),
    },
    crmSyncRecord: {
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => records.push(create)),
      groupBy: jest.fn(async () => []),
    },
  };
  const vault = { enabled: true, encryptJson: jest.fn((v: unknown) => `enc:${JSON.stringify(v)}`), decryptJson: jest.fn((t: string) => JSON.parse(t.slice(4))) };
  const notifications = { notifyOrgAdmins: jest.fn(async (_o: string, _a: string | null, _i: Record<string, unknown>) => undefined) };
  const service = new AudienceService({ client: db } as never, new ConfigService({}), vault as never, { log: jest.fn(async () => undefined) } as never, notifications as never);
  return { service, db, rows, records, notifications, vault };
}

const connected = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  orgId: 'org1',
  provider: 'brevo',
  status: 'CONNECTED',
  credentials: `enc:${JSON.stringify({ apiKey: 'xkeysib-1' })}`,
  config: { listId: '12', listName: 'Expo leads', autoSync: true },
  ...over,
});
const laila = { id: 'l1', name: 'Laila Hassan', email: 'Laila@Example.com', phone: '01007776655', company: 'Nile Co' };

afterEach(() => jest.restoreAllMocks());

describe('connecting', () => {
  it('checks the key, keeps it encrypted, and remembers the list chosen', async () => {
    fakeFetch(brevoOk);
    const { service, db, vault } = setup();
    await service.connect(tenant, 'brevo', { apiKey: ' xkeysib-1 ', listId: '12' });
    expect(vault.encryptJson).toHaveBeenCalledWith({ apiKey: 'xkeysib-1' }, 'audience:org1:brevo');
    expect(db.integrationConnection.create.mock.calls[0][0].data).toMatchObject({
      status: 'CONNECTED',
      externalAccountName: 'Nile Co',
      config: { listId: '12', listName: 'Expo leads', autoSync: true },
    });
  });

  it('keeps nothing when the key is refused, and says so', async () => {
    fakeFetch(() => ({ status: 401, body: { message: 'Key not found' } }));
    const { service, db } = setup();
    await expect(service.connect(tenant, 'brevo', { apiKey: 'bad', listId: '12' })).rejects.toThrow(/did not accept this key/);
    expect(db.integrationConnection.create).not.toHaveBeenCalled();
  });

  it('refuses a list the account does not have', async () => {
    fakeFetch(brevoOk);
    await expect(setup().service.connect(tenant, 'brevo', { apiKey: 'k', listId: '999' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an ActiveCampaign URL that is not ActiveCampaign’s, before calling anything', async () => {
    const sent = fakeFetch(() => ({ status: 200 }));
    await expect(setup().service.check('activecampaign', { apiKey: 'k', accountUrl: 'https://169.254.169.254/' })).rejects.toThrow(/API URL from ActiveCampaign/);
    expect(sent).toHaveLength(0);
  });
});

describe('each new lead', () => {
  it('is added to the chosen list, with a cleaned email and an international number', async () => {
    const sent = fakeFetch(brevoOk);
    const { service, records } = setup({ conn: connected(), leads: [laila] });
    await service.onEvent('org1', 'lead.created', { leadId: 'l1' });
    expect(sent[0].body).toMatchObject({ email: 'laila@example.com', attributes: { FIRSTNAME: 'Laila', LASTNAME: 'Hassan', SMS: '+201007776655' }, listIds: [12] });
    expect(records[0]).toMatchObject({ provider: 'brevo', entityId: 'l1', status: 'SYNCED', externalId: 'laila@example.com' });
  });

  it('waits for "Add recent leads" when adding automatically is off', async () => {
    const sent = fakeFetch(brevoOk);
    const { service } = setup({ conn: connected({ config: { listId: '12', listName: 'x', autoSync: false } }), leads: [laila] });
    await service.onEvent('org1', 'lead.created', { leadId: 'l1' });
    expect(sent).toHaveLength(0);
  });

  it('is skipped, not failed, when there is no email to add', async () => {
    const sent = fakeFetch(brevoOk);
    const { service, records } = setup({ conn: connected(), leads: [{ ...laila, email: null }] });
    await service.onEvent('org1', 'lead.created', { leadId: 'l1' });
    expect(sent).toHaveLength(0);
    expect(records[0]).toMatchObject({ status: 'SKIPPED', error: 'No email address' });
  });

  it('marks the connection when the key stops working, and tells the admins once', async () => {
    fakeFetch(() => ({ status: 401, body: { message: 'Key not found' } }));
    const { service, rows, notifications } = setup({ conn: connected(), leads: [laila, { ...laila, id: 'l2' }] });
    await service.onEvent('org1', 'lead.created', { leadId: 'l1' });
    await service.onEvent('org1', 'lead.created', { leadId: 'l2' });
    expect(rows[0]).toMatchObject({ status: 'ERROR', lastError: 'Brevo said 401: Key not found' });
    expect(notifications.notifyOrgAdmins).toHaveBeenCalledTimes(1);
    expect(notifications.notifyOrgAdmins.mock.calls[0][2]).toMatchObject({ type: 'integration.failed', metadata: { provider: 'brevo' } });
  });

  it('keeps a lead the tool refused as failed, without breaking the connection', async () => {
    fakeFetch(() => ({ status: 400, body: { message: 'Invalid email address' } }));
    const { service, rows, records } = setup({ conn: connected(), leads: [{ ...laila, phone: null }] });
    await service.onEvent('org1', 'lead.created', { leadId: 'l1' });
    expect(rows[0].status).toBe('CONNECTED');
    expect(records[0]).toMatchObject({ status: 'FAILED', error: 'Brevo said 400: Invalid email address' });
  });
});

describe('adding recent leads', () => {
  it('sends each one and says how it went', async () => {
    fakeFetch(brevoOk);
    const { service } = setup({ conn: connected(), leads: [laila, { ...laila, id: 'l2', email: null }, { ...laila, id: 'l3', email: 'omar@example.com' }] });
    await expect(service.syncRecent(tenant, 'brevo')).resolves.toEqual({ synced: 2, failed: 0, skipped: 1, total: 3 });
  });

  it('stops at the first lead once the key is refused, instead of failing them all', async () => {
    const sent = fakeFetch(() => ({ status: 401, body: { message: 'Key not found' } }));
    const { service } = setup({ conn: connected(), leads: [laila, { ...laila, id: 'l2' }, { ...laila, id: 'l3' }] });
    await expect(service.syncRecent(tenant, 'brevo')).resolves.toMatchObject({ failed: 1, synced: 0 });
    expect(sent).toHaveLength(1);
  });
});
