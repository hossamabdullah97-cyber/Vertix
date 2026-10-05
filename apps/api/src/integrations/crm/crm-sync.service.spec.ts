import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrmSyncService } from './crm-sync.service';

/** A stand-in for fetch: answers in order, keeps what was sent. */
function fakeFetch(...answers: { status: number; body?: unknown }[]) {
  const sent: { url: string; headers: Record<string, string>; body: unknown }[] = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    sent.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const a = answers.shift() ?? { status: 200 };
    return { status: a.status, text: async () => (a.body === undefined ? '' : JSON.stringify(a.body)) } as unknown as Response;
  }) as unknown as typeof fetch;
  return sent;
}
afterEach(() => jest.restoreAllMocks());

const tenant = { orgId: 'org1', userId: 'u1', role: 'OWNER' } as never;

function setup(opts: { provider: string; crm?: Record<string, unknown>; lead?: Record<string, unknown> }) {
  const records: Record<string, unknown>[] = [];
  const conn = { id: 'c1', orgId: 'org1', provider: opts.provider, config: { crm: opts.crm ?? { syncEnabled: true } } };
  const db = {
    integrationConnection: {
      findFirst: jest.fn(async () => conn),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(conn, data)),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    lead: { findFirst: jest.fn(async () => ({ id: 'l1', name: 'Laila Hassan', email: 'laila@example.com', phone: null, company: 'Nile Co', source: 'CARD', temperature: 'WARM', ...opts.lead })) },
    crmSyncRecord: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => (records.push(data), data)),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    },
  };
  const tokens = ['first-token', 'fresh-token'];
  const oauth = {
    getAuth: jest.fn(async (_org: string, _p: string, force?: boolean) => ({ token: force ? tokens[1] : tokens[0], apiBase: 'https://nileco.my.salesforce.com' })),
  };
  const service = new CrmSyncService({ client: db } as never, new ConfigService({}), oauth as never, { log: jest.fn(async () => undefined) } as never);
  return { service, oauth, records, conn };
}

describe('pushing a lead', () => {
  it('refreshes once and tries again when Salesforce says the session ended', async () => {
    const sent = fakeFetch({ status: 401, body: [{ message: 'Session expired or invalid', errorCode: 'INVALID_SESSION_ID' }] }, { status: 201, body: { id: '00Q1', success: true } });
    const { service, oauth, records } = setup({ provider: 'salesforce' });
    await expect(service.syncLead('org1', 'salesforce', 'l1')).resolves.toMatchObject({ ok: true, externalId: '00Q1', created: true });
    expect(oauth.getAuth).toHaveBeenLastCalledWith('org1', 'salesforce', true);
    expect(sent.map((s) => s.headers.authorization)).toEqual(['Bearer first-token', 'Bearer fresh-token']);
    expect(records[0]).toMatchObject({ provider: 'salesforce', status: 'SYNCED', externalId: '00Q1' });
  });

  it('does not retry anything else, and keeps the failure', async () => {
    const sent = fakeFetch({ status: 400, body: [{ message: 'Email: invalid email address', errorCode: 'INVALID_EMAIL_ADDRESS' }] });
    const { service, records } = setup({ provider: 'salesforce' });
    await expect(service.syncLead('org1', 'salesforce', 'l1')).rejects.toThrow('Salesforce said 400: Email: invalid email address');
    expect(sent).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: 'FAILED' });
  });

  it('skips a lead without an email for a Mailchimp audience, without calling Mailchimp', async () => {
    const sent = fakeFetch();
    const { service, records } = setup({ provider: 'mailchimp', crm: { syncEnabled: true, listId: 'abc' }, lead: { email: null } });
    await expect(service.syncLead('org1', 'mailchimp', 'l1')).resolves.toMatchObject({ skipped: true });
    expect(sent).toHaveLength(0);
    expect(records[0]).toMatchObject({ status: 'SKIPPED', error: 'No email address' });
  });

  it('adds the lead to the chosen audience', async () => {
    const sent = fakeFetch({ status: 200, body: { id: 'hash' } });
    const { service } = setup({ provider: 'mailchimp', crm: { syncEnabled: true, listId: 'abc' } });
    await service.syncLead('org1', 'mailchimp', 'l1');
    expect(sent[0].url).toMatch(/\/3\.0\/lists\/abc\/members\/[0-9a-f]{32}$/);
    expect(sent[0].body).toMatchObject({ email_address: 'laila@example.com', status_if_new: 'transactional', merge_fields: { FNAME: 'Laila', LNAME: 'Hassan' } });
  });
});

describe('Mailchimp settings', () => {
  it('will not switch on adding leads before an audience is chosen', async () => {
    const { service } = setup({ provider: 'mailchimp', crm: { syncEnabled: false } });
    await expect(service.saveConfig(tenant, 'mailchimp', { syncEnabled: true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('takes only one of the account’s audiences', async () => {
    fakeFetch({ status: 200, body: { lists: [{ id: 'abc', name: 'Expo' }] } }, { status: 200, body: { lists: [{ id: 'abc', name: 'Expo' }] } });
    const { service } = setup({ provider: 'mailchimp', crm: { syncEnabled: false } });
    await expect(service.saveConfig(tenant, 'mailchimp', { listId: 'nope' })).rejects.toThrow('Choose one of the account’s lists.');
    await expect(service.saveConfig(tenant, 'mailchimp', { listId: 'abc', syncEnabled: true })).resolves.toMatchObject({ syncEnabled: true, listId: 'abc', listName: 'Expo' });
  });
});
