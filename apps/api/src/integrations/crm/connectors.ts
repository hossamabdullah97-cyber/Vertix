import { createHash } from 'node:crypto';

/**
 * The CRMs and audiences a lead is pushed to over OAuth: Salesforce (a Lead),
 * Zoho CRM (a Lead), Pipedrive (a Person, with their organization) and
 * Mailchimp (an audience member). Each takes the properties the field mapping
 * produced and shapes them the way its API wants. Real HTTP calls against the
 * account's own API host, which the OAuth connection supplies.
 */

export interface ConnectorAuth {
  token: string;
  /** The account's API host (Salesforce instance, Zoho region, Pipedrive company, Mailchimp data centre). */
  apiBase: string | null;
}

export interface ConnectorOptions {
  /** Mailchimp: the audience the lead joins. */
  listId?: string;
}

/** A refusal from the provider, with its status: 401 means the token needs refreshing. */
export class ConnectorError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface CrmConnector {
  createContact(auth: ConnectorAuth, props: Record<string, string>, opts?: ConnectorOptions): Promise<{ externalId: string }>;
  updateContact(auth: ConnectorAuth, externalId: string, props: Record<string, string>, opts?: ConnectorOptions): Promise<{ externalId: string }>;
}

const TIMEOUT_MS = 12_000;

export async function request(
  who: string,
  url: string,
  init: { method?: string; headers: Record<string, string>; body?: unknown },
): Promise<{ status: number; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: { accept: 'application/json', ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}), ...init.headers },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new ConnectorError(`${who} could not be reached (${(err as Error).name === 'AbortError' ? 'no answer in time' : (err as Error).message})`, 0);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text().catch(() => '');
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* not JSON */
  }
  if (res.status >= 400) throw new ConnectorError(`${who} said ${res.status}${errorText(json) ? `: ${errorText(json)}` : ''}`, res.status);
  return { status: res.status, json };
}

/** The message in the error shapes these APIs use. */
function errorText(json: unknown): string {
  const first = Array.isArray(json) ? json[0] : json;
  const o = (first ?? {}) as Record<string, unknown>;
  const data = Array.isArray(o.data) ? (o.data[0] as Record<string, unknown>) : undefined;
  return String(o.message ?? o.detail ?? o.error ?? o.title ?? data?.message ?? '').slice(0, 300);
}

const PLACEHOLDER = '[not provided]';

// ---------------------------------------------------------------- Salesforce

export class SalesforceConnector implements CrmConnector {
  private base(auth: ConnectorAuth) {
    if (!auth.apiBase) throw new ConnectorError('Salesforce did not say where this org’s API is. Connect it again.', 400);
    return `${auth.apiBase}/services/data/v60.0/sobjects/Lead`;
  }

  /** A Lead must have a last name and a company. */
  private shape(props: Record<string, string>) {
    return { ...props, LastName: props.LastName || props.FirstName || PLACEHOLDER, Company: props.Company || PLACEHOLDER };
  }

  async createContact(auth: ConnectorAuth, props: Record<string, string>) {
    const { json } = await request('Salesforce', this.base(auth), { method: 'POST', headers: { authorization: `Bearer ${auth.token}` }, body: this.shape(props) });
    return { externalId: String((json as { id?: string }).id) };
  }

  async updateContact(auth: ConnectorAuth, externalId: string, props: Record<string, string>) {
    await request('Salesforce', `${this.base(auth)}/${encodeURIComponent(externalId)}`, { method: 'PATCH', headers: { authorization: `Bearer ${auth.token}` }, body: this.shape(props) });
    return { externalId };
  }
}

// ------------------------------------------------------------------ Zoho CRM

export class ZohoConnector implements CrmConnector {
  private url(auth: ConnectorAuth) {
    return `${auth.apiBase ?? 'https://www.zohoapis.com'}/crm/v6/Leads`;
  }

  private shape(props: Record<string, string>) {
    return { ...props, Last_Name: props.Last_Name || props.First_Name || PLACEHOLDER };
  }

  /** Zoho answers per record inside a 2xx: a record it refused is an error too. */
  private result(json: unknown): string {
    const row = ((json as { data?: { status?: string; code?: string; message?: string; details?: { id?: string } }[] }).data ?? [])[0];
    if (!row || row.status !== 'success' || !row.details?.id) throw new ConnectorError(`Zoho CRM said ${row?.code ?? 'no result'}${row?.message ? `: ${row.message}` : ''}`, 400);
    return String(row.details.id);
  }

  async createContact(auth: ConnectorAuth, props: Record<string, string>) {
    const { json } = await request('Zoho CRM', this.url(auth), { method: 'POST', headers: { authorization: `Zoho-oauthtoken ${auth.token}` }, body: { data: [this.shape(props)] } });
    return { externalId: this.result(json) };
  }

  async updateContact(auth: ConnectorAuth, externalId: string, props: Record<string, string>) {
    const { json } = await request('Zoho CRM', this.url(auth), { method: 'PUT', headers: { authorization: `Zoho-oauthtoken ${auth.token}` }, body: { data: [{ id: externalId, ...this.shape(props) }] } });
    return { externalId: this.result(json) };
  }
}

// ----------------------------------------------------------------- Pipedrive

export class PipedriveConnector implements CrmConnector {
  private base(auth: ConnectorAuth) {
    return `${auth.apiBase ?? 'https://api.pipedrive.com'}/api/v1`;
  }

  /** The organization by its exact name, made when there is none. */
  private async orgId(auth: ConnectorAuth, name: string): Promise<number> {
    const h = { authorization: `Bearer ${auth.token}` };
    const q = new URLSearchParams({ term: name, fields: 'name', exact_match: 'true', limit: '1' });
    const found = await request('Pipedrive', `${this.base(auth)}/organizations/search?${q}`, { headers: h });
    const item = (found.json as { data?: { items?: { item?: { id?: number } }[] } }).data?.items?.[0]?.item;
    if (item?.id) return item.id;
    const made = await request('Pipedrive', `${this.base(auth)}/organizations`, { method: 'POST', headers: h, body: { name } });
    return Number((made.json as { data?: { id?: number } }).data?.id);
  }

  /** Email and phone go as lists; the company becomes the person's organization. */
  private async shape(auth: ConnectorAuth, props: Record<string, string>) {
    const { email, phone, org_name: orgName, ...rest } = props;
    return {
      ...rest,
      name: rest.name || email || phone || PLACEHOLDER,
      ...(email ? { email: [{ value: email, primary: true, label: 'work' }] } : {}),
      ...(phone ? { phone: [{ value: phone, primary: true, label: 'work' }] } : {}),
      ...(orgName ? { org_id: await this.orgId(auth, orgName) } : {}),
    };
  }

  async createContact(auth: ConnectorAuth, props: Record<string, string>) {
    const { json } = await request('Pipedrive', `${this.base(auth)}/persons`, { method: 'POST', headers: { authorization: `Bearer ${auth.token}` }, body: await this.shape(auth, props) });
    return { externalId: String((json as { data?: { id?: number } }).data?.id) };
  }

  async updateContact(auth: ConnectorAuth, externalId: string, props: Record<string, string>) {
    await request('Pipedrive', `${this.base(auth)}/persons/${encodeURIComponent(externalId)}`, { method: 'PUT', headers: { authorization: `Bearer ${auth.token}` }, body: await this.shape(auth, props) });
    return { externalId };
  }
}

// ----------------------------------------------------------------- Mailchimp

export class MailchimpConnector implements CrmConnector {
  private base(auth: ConnectorAuth) {
    if (!auth.apiBase) throw new ConnectorError('Mailchimp did not say which data centre this account is in. Connect it again.', 400);
    return `${auth.apiBase}/3.0`;
  }

  /** The account's audiences, to choose the one leads join. */
  async lists(auth: ConnectorAuth): Promise<{ id: string; name: string }[]> {
    const { json } = await request('Mailchimp', `${this.base(auth)}/lists?count=100&fields=lists.id,lists.name`, { headers: { authorization: `Bearer ${auth.token}` } });
    return ((json as { lists?: { id: string; name: string }[] }).lists ?? []).map((l) => ({ id: l.id, name: l.name }));
  }

  /**
   * Adds or updates the member by email (Mailchimp keys members by the hash of
   * it). New members are "transactional": on the audience, not subscribed to
   * campaigns.
   */
  private async upsert(auth: ConnectorAuth, props: Record<string, string>, opts?: ConnectorOptions) {
    if (!opts?.listId) throw new ConnectorError('Choose the Mailchimp audience leads join.', 400);
    const { email_address: email, ...merge } = props;
    if (!email) throw new ConnectorError('No email address', 422);
    const hash = createHash('md5').update(email.toLowerCase()).digest('hex');
    const { json } = await request('Mailchimp', `${this.base(auth)}/lists/${encodeURIComponent(opts.listId)}/members/${hash}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${auth.token}` },
      body: { email_address: email, status_if_new: 'transactional', ...(Object.keys(merge).length ? { merge_fields: merge } : {}) },
    });
    return { externalId: String((json as { id?: string }).id ?? hash) };
  }

  createContact(auth: ConnectorAuth, props: Record<string, string>, opts?: ConnectorOptions) {
    return this.upsert(auth, props, opts);
  }

  updateContact(auth: ConnectorAuth, _externalId: string, props: Record<string, string>, opts?: ConnectorOptions) {
    return this.upsert(auth, props, opts);
  }
}

// ------------------------------------------------------- Microsoft Dynamics 365

/**
 * A Lead in the environment the workspace connected (its Web API, OData v4).
 * A lead needs a last name; the topic says where it came from.
 */
export class DynamicsConnector implements CrmConnector {
  private base(auth: ConnectorAuth) {
    if (!auth.apiBase) throw new ConnectorError('Dynamics 365 did not say which environment to use. Connect it again.', 400);
    return `${auth.apiBase}/api/data/v9.2/leads`;
  }

  private headers(auth: ConnectorAuth) {
    return { authorization: `Bearer ${auth.token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'return=representation' };
  }

  private shape(props: Record<string, string>) {
    return { subject: 'Vertex Connect', ...props, lastname: props.lastname || props.firstname || PLACEHOLDER };
  }

  async createContact(auth: ConnectorAuth, props: Record<string, string>) {
    const { json } = await request('Dynamics 365', `${this.base(auth)}?$select=leadid`, { method: 'POST', headers: this.headers(auth), body: this.shape(props) });
    const id = (json as { leadid?: string }).leadid;
    if (!id) throw new ConnectorError('Dynamics 365 did not return the lead', 502);
    return { externalId: id };
  }

  async updateContact(auth: ConnectorAuth, externalId: string, props: Record<string, string>) {
    await request('Dynamics 365', `${this.base(auth)}(${encodeURIComponent(externalId)})`, { method: 'PATCH', headers: this.headers(auth), body: this.shape(props) });
    return { externalId };
  }
}
