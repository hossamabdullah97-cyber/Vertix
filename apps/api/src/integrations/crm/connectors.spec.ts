import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ConnectorError, DynamicsConnector, MailchimpConnector, PipedriveConnector, SalesforceConnector, ZohoConnector } from './connectors';
import { apiBaseFor } from '../oauth-providers';
import { applyMapping, DEFAULT_DYNAMICS_MAPPING, DEFAULT_MAILCHIMP_MAPPING, DEFAULT_PIPEDRIVE_MAPPING, DEFAULT_SALESFORCE_MAPPING, DEFAULT_ZOHO_MAPPING } from './field-mapping';

/** A stand-in for fetch: answers in order, keeps what was sent. */
function fakeFetch(...answers: { status: number; body?: unknown }[]) {
  const sent: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    sent.push({ url, method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const a = answers.shift() ?? { status: 200 };
    return { status: a.status, text: async () => (a.body === undefined ? '' : JSON.stringify(a.body)) } as unknown as Response;
  }) as unknown as typeof fetch;
  return sent;
}
afterEach(() => jest.restoreAllMocks());

const lead = { name: 'Laila Hassan', email: 'laila@example.com', phone: '+201007776655', company: 'Nile Co' };
const env = new ConfigService({});

describe('where an account’s API lives', () => {
  it('takes the address a provider names only when it is one of its own hosts', () => {
    expect(apiBaseFor('salesforce', 'https://nileco.my.salesforce.com', env)).toBe('https://nileco.my.salesforce.com');
    expect(apiBaseFor('salesforce', 'https://nileco--dev.sandbox.my.salesforce.com/', env)).toBe('https://nileco--dev.sandbox.my.salesforce.com');
    expect(apiBaseFor('zoho_crm', 'https://www.zohoapis.eu', env)).toBe('https://www.zohoapis.eu');
    expect(apiBaseFor('pipedrive', 'https://nileco.pipedrive.com', env)).toBe('https://nileco.pipedrive.com');
    expect(apiBaseFor('mailchimp', 'https://us21.api.mailchimp.com', env)).toBe('https://us21.api.mailchimp.com');
    expect(apiBaseFor('salesforce', 'https://evil.example/my.salesforce.com', env)).toBeNull();
    expect(apiBaseFor('salesforce', 'http://nileco.my.salesforce.com', env)).toBeNull();
    expect(apiBaseFor('mailchimp', 'https://169.254.169.254', env)).toBeNull();
    expect(apiBaseFor('zoho_crm', 'https://zohoapis.evil.com', env)).toBeNull();
    expect(apiBaseFor('pipedrive', undefined, env)).toBeNull();
  });

  it('lets a deployment point a provider at a sandbox', () => {
    expect(apiBaseFor('salesforce', 'https://anything', new ConfigService({ OAUTH_SALESFORCE_API_URL: 'http://localhost:4004/sf/' }))).toBe('http://localhost:4004/sf');
  });
});

describe('Salesforce', () => {
  const auth = { token: 'sf-token', apiBase: 'https://nileco.my.salesforce.com' };

  it('creates a Lead, filling the last name and company it requires', async () => {
    const sent = fakeFetch({ status: 201, body: { id: '00Q5g00000ABCDE', success: true } });
    const props = applyMapping({ name: 'Omar' }, DEFAULT_SALESFORCE_MAPPING);
    await expect(new SalesforceConnector().createContact(auth, props)).resolves.toEqual({ externalId: '00Q5g00000ABCDE' });
    expect(sent[0]).toMatchObject({
      url: 'https://nileco.my.salesforce.com/services/data/v60.0/sobjects/Lead',
      method: 'POST',
      headers: { authorization: 'Bearer sf-token' },
      body: { FirstName: 'Omar', LastName: 'Omar', Company: '[not provided]' },
    });
  });

  it('updates the same Lead later', async () => {
    const sent = fakeFetch({ status: 204 });
    await new SalesforceConnector().updateContact(auth, '00Q1', applyMapping(lead, DEFAULT_SALESFORCE_MAPPING));
    expect(sent[0]).toMatchObject({ url: 'https://nileco.my.salesforce.com/services/data/v60.0/sobjects/Lead/00Q1', method: 'PATCH', body: { FirstName: 'Laila', LastName: 'Hassan', Company: 'Nile Co' } });
  });

  it('reports an ended session as 401, so the token is refreshed', async () => {
    fakeFetch({ status: 401, body: [{ message: 'Session expired or invalid', errorCode: 'INVALID_SESSION_ID' }] });
    await expect(new SalesforceConnector().createContact(auth, { LastName: 'x' })).rejects.toMatchObject({ status: 401, message: 'Salesforce said 401: Session expired or invalid' });
  });
});

describe('Zoho CRM', () => {
  it('creates a Lead in the account’s region, and treats a refused record as an error', async () => {
    const sent = fakeFetch({ status: 201, body: { data: [{ code: 'SUCCESS', status: 'success', details: { id: '5725767000000524157' } }] } }, { status: 202, body: { data: [{ code: 'INVALID_DATA', status: 'error', message: 'invalid data' }] } });
    const z = new ZohoConnector();
    const auth = { token: 'z', apiBase: 'https://www.zohoapis.eu' };
    await expect(z.createContact(auth, applyMapping(lead, DEFAULT_ZOHO_MAPPING))).resolves.toEqual({ externalId: '5725767000000524157' });
    expect(sent[0]).toMatchObject({
      url: 'https://www.zohoapis.eu/crm/v6/Leads',
      headers: { authorization: 'Zoho-oauthtoken z' },
      body: { data: [{ First_Name: 'Laila', Last_Name: 'Hassan', Email: 'laila@example.com', Phone: '+201007776655', Company: 'Nile Co' }] },
    });
    await expect(z.updateContact(auth, '1', { Email: 'bad' })).rejects.toBeInstanceOf(ConnectorError);
    expect(sent[1].body).toEqual({ data: [{ id: '1', Email: 'bad', Last_Name: '[not provided]' }] });
  });
});

describe('Pipedrive', () => {
  const auth = { token: 'pd', apiBase: 'https://nileco.pipedrive.com' };

  it('adds the person with their email and phone as lists, under their organization', async () => {
    const sent = fakeFetch({ status: 200, body: { data: { items: [{ item: { id: 42 } }] } } }, { status: 201, body: { data: { id: 7 } } });
    await expect(new PipedriveConnector().createContact(auth, applyMapping(lead, DEFAULT_PIPEDRIVE_MAPPING))).resolves.toEqual({ externalId: '7' });
    expect(sent[0].url).toBe('https://nileco.pipedrive.com/api/v1/organizations/search?term=Nile+Co&fields=name&exact_match=true&limit=1');
    expect(sent[1]).toMatchObject({
      url: 'https://nileco.pipedrive.com/api/v1/persons',
      body: { name: 'Laila Hassan', email: [{ value: 'laila@example.com', primary: true, label: 'work' }], phone: [{ value: '+201007776655', primary: true, label: 'work' }], org_id: 42 },
    });
  });

  it('makes the organization when there is none by that name', async () => {
    const sent = fakeFetch({ status: 200, body: { data: { items: [] } } }, { status: 201, body: { data: { id: 99 } } }, { status: 201, body: { data: { id: 8 } } });
    await new PipedriveConnector().createContact(auth, { name: 'Omar', org_name: 'Delta Ltd' });
    expect(sent[1]).toMatchObject({ url: 'https://nileco.pipedrive.com/api/v1/organizations', method: 'POST', body: { name: 'Delta Ltd' } });
    expect(sent[2].body).toEqual({ name: 'Omar', org_id: 99 });
  });
});

describe('Mailchimp', () => {
  const auth = { token: 'mc', apiBase: 'https://us21.api.mailchimp.com' };

  it('adds the member by email to the chosen audience, not subscribed', async () => {
    const sent = fakeFetch({ status: 200, body: { id: '0d2f5ba48c4b7e0d4e7b1ac4bbe4d6f3' } });
    await new MailchimpConnector().createContact(auth, applyMapping({ ...lead, email: 'Laila@Example.com' }, DEFAULT_MAILCHIMP_MAPPING), { listId: 'abc123' });
    // The member's address is the MD5 of the lower-cased email.
    expect(sent[0].url).toBe(`https://us21.api.mailchimp.com/3.0/lists/abc123/members/${createHash('md5').update('laila@example.com').digest('hex')}`);
    expect(sent[0]).toMatchObject({
      method: 'PUT',
      body: { email_address: 'Laila@Example.com', status_if_new: 'transactional', merge_fields: { FNAME: 'Laila', LNAME: 'Hassan', PHONE: '+201007776655' } },
    });
  });

  it('needs an audience chosen', async () => {
    fakeFetch();
    await expect(new MailchimpConnector().createContact(auth, { email_address: 'a@b.co' })).rejects.toThrow('Choose the Mailchimp audience leads join.');
  });

  it('lists the account’s audiences', async () => {
    fakeFetch({ status: 200, body: { lists: [{ id: 'abc123', name: 'Expo' }] } });
    await expect(new MailchimpConnector().lists(auth)).resolves.toEqual([{ id: 'abc123', name: 'Expo' }]);
  });
});

describe('Dynamics 365', () => {
  const auth = { token: 'd', apiBase: 'https://nileco.crm4.dynamics.com' };

  it('creates a Lead in the environment and gets its id back', async () => {
    const sent = fakeFetch({ status: 201, body: { leadid: 'b5a1c2d3-0000-4000-8000-000000000001' } });
    await expect(new DynamicsConnector().createContact(auth, applyMapping(lead, DEFAULT_DYNAMICS_MAPPING))).resolves.toEqual({ externalId: 'b5a1c2d3-0000-4000-8000-000000000001' });
    expect(sent[0]).toMatchObject({
      url: 'https://nileco.crm4.dynamics.com/api/data/v9.2/leads?$select=leadid',
      method: 'POST',
      headers: { authorization: 'Bearer d', 'OData-Version': '4.0', Prefer: 'return=representation' },
      body: { subject: 'Vertex Connect', firstname: 'Laila', lastname: 'Hassan', emailaddress1: 'laila@example.com', mobilephone: '+201007776655', companyname: 'Nile Co' },
    });
  });

  it('updates the same Lead, and gives it a last name when there is none', async () => {
    const sent = fakeFetch({ status: 204 });
    await new DynamicsConnector().updateContact(auth, 'abc', { firstname: 'Omar' });
    expect(sent[0]).toMatchObject({ url: 'https://nileco.crm4.dynamics.com/api/data/v9.2/leads(abc)', method: 'PATCH', body: { subject: 'Vertex Connect', firstname: 'Omar', lastname: 'Omar' } });
  });

  it('only takes Dynamics hosts as an environment', () => {
    expect(apiBaseFor('dynamics', 'https://nileco.crm4.dynamics.com/main.aspx', env)).toBe('https://nileco.crm4.dynamics.com');
    expect(apiBaseFor('dynamics', 'https://nileco.crm.dynamics.com', env)).toBe('https://nileco.crm.dynamics.com');
    expect(apiBaseFor('dynamics', 'https://dynamics.com.evil.example', env)).toBeNull();
    expect(apiBaseFor('dynamics', 'https://nileco.crm4.dynamics.com.evil.example', env)).toBeNull();
  });
});
