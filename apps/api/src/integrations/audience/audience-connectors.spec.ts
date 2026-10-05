import {
  ActiveCampaignConnector,
  AudienceError,
  BrevoConnector,
  KlaviyoConnector,
  activeCampaignBase,
  splitName,
  toE164,
} from './audience-connectors';

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

const laila = { email: 'laila@example.com', firstName: 'Laila', lastName: 'Hassan', phone: '+201007776655', company: 'Nile Co' };

describe('what the tools are sent', () => {
  it('reads phone numbers into the international form, and leaves out what it cannot read', () => {
    expect(toE164('01007776655')).toBe('+201007776655');
    expect(toE164('٠١٠٠٧٧٧٦٦٥٥')).toBe('+201007776655');
    expect(toE164('0020 100 777 6655')).toBe('+201007776655');
    expect(toE164('+971 50 123 4567')).toBe('+971501234567');
    expect(toE164('1007776655')).toBe('+201007776655');
    expect(toE164('12345')).toBeUndefined();
    expect(toE164('0223456789')).toBeUndefined();
    expect(toE164(null)).toBeUndefined();
  });

  it('splits a name into first and last', () => {
    expect(splitName('  Laila  Ahmed Hassan ')).toEqual({ firstName: 'Laila', lastName: 'Ahmed Hassan' });
    expect(splitName('Omar')).toEqual({ firstName: 'Omar' });
    expect(splitName('')).toEqual({});
  });
});

describe('Brevo', () => {
  it('adds the person to the list, updating them when the email is already there', async () => {
    const sent = fakeFetch({ status: 201, body: { id: 7 } });
    await expect(new BrevoConnector('xkeysib-1').upsert(laila, '12')).resolves.toBe('laila@example.com');
    expect(sent[0]).toMatchObject({
      url: 'https://api.brevo.com/v3/contacts',
      method: 'POST',
      headers: { 'api-key': 'xkeysib-1' },
      body: { email: 'laila@example.com', attributes: { FIRSTNAME: 'Laila', LASTNAME: 'Hassan', SMS: '+201007776655' }, listIds: [12], updateEnabled: true },
    });
  });

  it('still adds them when the number already belongs to another contact', async () => {
    const sent = fakeFetch({ status: 400, body: { code: 'duplicate_parameter', message: 'SMS is already associated with another Contact' } }, { status: 204 });
    await new BrevoConnector('k').upsert(laila, '12');
    expect((sent[1].body as { attributes: Record<string, string> }).attributes).toEqual({ FIRSTNAME: 'Laila', LASTNAME: 'Hassan' });
  });

  it('says whose account and which lists', async () => {
    fakeFetch({ status: 200, body: { email: 'a@nile.co', companyName: 'Nile Co' } }, { status: 200, body: { lists: [{ id: 3, name: 'Expo leads' }] } });
    const b = new BrevoConnector('k');
    await expect(b.account()).resolves.toBe('Nile Co');
    await expect(b.lists()).resolves.toEqual([{ id: '3', name: 'Expo leads' }]);
  });

  it('turns a refused key into an error that says so', async () => {
    fakeFetch({ status: 401, body: { code: 'unauthorized', message: 'Key not found' } });
    const err = await new BrevoConnector('bad').account().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AudienceError);
    expect(err).toMatchObject({ status: 401, message: 'Brevo said 401: Key not found' });
  });

  it('needs an email', () => {
    expect(new BrevoConnector('k').accepts({ email: null, phone: '+201007776655' })).toBe(false);
  });
});

describe('ActiveCampaign', () => {
  it('only ever calls ActiveCampaign’s own hosts', () => {
    expect(activeCampaignBase('https://nileco.api-us1.com')).toBe('https://nileco.api-us1.com/api/3');
    expect(activeCampaignBase('https://NileCo.api-us1.com/api/3/')).toBe('https://nileco.api-us1.com/api/3');
    expect(activeCampaignBase('https://nileco.activehosted.com')).toBe('https://nileco.activehosted.com/api/3');
    expect(activeCampaignBase('http://nileco.api-us1.com')).toBeNull();
    expect(activeCampaignBase('https://evil.example/nileco.api-us1.com')).toBeNull();
    expect(activeCampaignBase('https://a.b.api-us1.com')).toBeNull();
    expect(activeCampaignBase('https://169.254.169.254')).toBeNull();
    expect(activeCampaignBase(undefined)).toBeNull();
  });

  it('syncs the contact by email, then puts them on the list', async () => {
    const sent = fakeFetch({ status: 201, body: { contact: { id: '88' } } }, { status: 201, body: { contactList: {} } });
    await expect(new ActiveCampaignConnector('ac-key', 'https://nileco.api-us1.com/api/3').upsert(laila, '4')).resolves.toBe('88');
    expect(sent[0]).toMatchObject({
      url: 'https://nileco.api-us1.com/api/3/contact/sync',
      headers: { 'Api-Token': 'ac-key' },
      body: { contact: { email: 'laila@example.com', firstName: 'Laila', lastName: 'Hassan', phone: '+201007776655' } },
    });
    expect(sent[1]).toMatchObject({ url: 'https://nileco.api-us1.com/api/3/contactLists', body: { contactList: { list: '4', contact: '88', status: 1 } } });
  });

  it('names the account by its address', async () => {
    fakeFetch({ status: 200, body: { user: { email: 'a@nile.co' } } });
    await expect(new ActiveCampaignConnector('k', 'https://nileco.api-us1.com/api/3').account()).resolves.toBe('nileco');
    fakeFetch({ status: 200, body: { user: { email: 'a@nile.co' } } });
    await expect(new ActiveCampaignConnector('k', 'http://localhost:4003/ac/api/3', 'https://nileco.api-us1.com').account()).resolves.toBe('nileco');
  });
});

describe('Klaviyo', () => {
  it('imports the profile, then adds it to the list without subscribing it', async () => {
    const sent = fakeFetch({ status: 201, body: { data: { id: '01HPROFILE' } } }, { status: 204 });
    await expect(new KlaviyoConnector('pk_1').upsert(laila, 'XyZ')).resolves.toBe('01HPROFILE');
    expect(sent[0]).toMatchObject({
      url: 'https://a.klaviyo.com/api/profile-import/',
      headers: { authorization: 'Klaviyo-API-Key pk_1', revision: '2024-10-15' },
      body: { data: { type: 'profile', attributes: { email: 'laila@example.com', phone_number: '+201007776655', first_name: 'Laila', last_name: 'Hassan', organization: 'Nile Co' } } },
    });
    expect(sent[1]).toMatchObject({ url: 'https://a.klaviyo.com/api/lists/XyZ/relationships/profiles/', body: { data: [{ type: 'profile', id: '01HPROFILE' }] } });
    expect(JSON.stringify(sent)).not.toContain('subscri');
  });

  it('takes a person known only by their number', () => {
    expect(new KlaviyoConnector('k').accepts({ email: null, phone: '+201007776655' })).toBe(true);
    expect(new KlaviyoConnector('k').accepts({ email: null })).toBe(false);
  });

  it('reads Klaviyo’s error format', async () => {
    fakeFetch({ status: 400, body: { errors: [{ detail: 'Invalid phone number format' }] } });
    await expect(new KlaviyoConnector('k').upsert(laila, 'L')).rejects.toMatchObject({ status: 400, message: 'Klaviyo said 400: Invalid phone number format' });
  });
});
