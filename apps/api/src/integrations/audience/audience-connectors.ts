/**
 * Email-marketing tools a workspace connects with its own API key: Brevo,
 * ActiveCampaign and Klaviyo. Each does the same three things: say whose
 * account the key opens, list its lists, and add a person to one of them
 * (created, or updated when the email is already there). Real HTTP calls; the
 * base URLs can be pointed elsewhere for tests.
 */

export type AudienceProvider = 'brevo' | 'activecampaign' | 'klaviyo';
export const AUDIENCE_PROVIDERS: AudienceProvider[] = ['brevo', 'activecampaign', 'klaviyo'];
export const isAudienceProvider = (p: string): p is AudienceProvider => (AUDIENCE_PROVIDERS as string[]).includes(p);

export interface AudienceCredentials {
  apiKey: string;
  /** ActiveCampaign only: the account's API URL (https://<account>.api-us1.com). */
  accountUrl?: string;
}

export interface AudienceList {
  id: string;
  name: string;
}

/** The person as the tools take them. */
export interface AudienceContact {
  email: string | null;
  firstName?: string;
  lastName?: string;
  /** International form (+201001234567), or absent when it could not be read as one. */
  phone?: string;
  company?: string;
}

/** A refusal from the tool, with its status: 401/403 mean the key no longer works. */
export class AudienceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 12_000;

async function call(url: string, init: { method?: string; headers: Record<string, string>; body?: unknown }, who: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: { accept: 'application/json', ...init.headers, ...(init.body !== undefined ? { 'content-type': init.headers['content-type'] ?? 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new AudienceError(`${who} could not be reached (${(err as Error).name === 'AbortError' ? 'no answer in time' : (err as Error).message})`, 0);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text().catch(() => '');
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* not JSON */
  }
  if (res.status >= 400) {
    const errors = json.errors as { detail?: string; title?: string }[] | undefined;
    const said = String(json.message ?? errors?.[0]?.detail ?? errors?.[0]?.title ?? '').slice(0, 300);
    throw new AudienceError(`${who} said ${res.status}${said ? `: ${said}` : ''}`, res.status);
  }
  return { status: res.status, json };
}

/** A name split the way the tools keep it. */
export function splitName(name: string | null | undefined): { firstName?: string; lastName?: string } {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return { firstName: parts[0], ...(parts.length > 1 ? { lastName: parts.slice(1).join(' ') } : {}) };
}

/**
 * A phone number in international form, which the tools insist on. A local
 * Egyptian number (01x…) gets +20; anything that cannot be read as a full
 * number is left out rather than have the whole contact refused.
 */
export function toE164(phone: string | null | undefined): string | undefined {
  const raw = (phone ?? '')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .trim();
  let d = raw.replace(/\D/g, '');
  if (!d) return undefined;
  if (raw.startsWith('+')) return d.length >= 8 && d.length <= 15 ? `+${d}` : undefined;
  if (d.startsWith('00')) d = d.slice(2);
  else if (/^01[0125]\d{8}$/.test(d)) d = `20${d.slice(1)}`;
  else if (/^1[0125]\d{8}$/.test(d)) d = `20${d}`;
  else if (!/^20\d{10}$/.test(d)) return undefined;
  return d.length >= 8 && d.length <= 15 ? `+${d}` : undefined;
}

export interface AudienceConnector {
  readonly name: string;
  /** Whose account the key opens; throws when the key does not work. */
  account(): Promise<string>;
  lists(): Promise<AudienceList[]>;
  /** Adds the person to the list (or updates them), returning their id in the tool. */
  upsert(contact: AudienceContact, listId: string): Promise<string>;
  /** Whether a contact can be sent at all (some tools need an email). */
  accepts(contact: AudienceContact): boolean;
}

// --------------------------------------------------------------------- Brevo

export class BrevoConnector implements AudienceConnector {
  readonly name = 'Brevo';
  constructor(
    private readonly apiKey: string,
    private readonly base = 'https://api.brevo.com/v3',
  ) {}

  private req(path: string, method = 'GET', body?: unknown) {
    return call(`${this.base}${path}`, { method, headers: { 'api-key': this.apiKey }, body }, this.name);
  }

  async account() {
    const { json } = await this.req('/account');
    return String(json.companyName || json.email || 'Brevo');
  }

  async lists() {
    const { json } = await this.req('/contacts/lists?limit=50&offset=0&sort=desc');
    return ((json.lists as { id: number; name: string }[] | undefined) ?? []).map((l) => ({ id: String(l.id), name: l.name }));
  }

  accepts(c: AudienceContact) {
    return !!c.email;
  }

  async upsert(c: AudienceContact, listId: string) {
    const attributes: Record<string, string> = {};
    if (c.firstName) attributes.FIRSTNAME = c.firstName;
    if (c.lastName) attributes.LASTNAME = c.lastName;
    const body = (withPhone: boolean) => ({
      email: c.email,
      attributes: withPhone && c.phone ? { ...attributes, SMS: c.phone } : attributes,
      listIds: [Number(listId)],
      updateEnabled: true,
    });
    try {
      await this.req('/contacts', 'POST', body(true));
    } catch (err) {
      // Brevo keeps a number on one contact only; the person still belongs on the list without it.
      if (!(err instanceof AudienceError) || err.status !== 400 || !c.phone || !/sms|phone/i.test(err.message)) throw err;
      await this.req('/contacts', 'POST', body(false));
    }
    return c.email!;
  }
}

// ------------------------------------------------------------ ActiveCampaign

/**
 * The ActiveCampaign API URL an account shows under Settings → Developer, and
 * nothing else: the server only ever calls ActiveCampaign's own hosts.
 */
export function activeCampaignBase(raw: string | undefined): string | null {
  let u: URL;
  try {
    u = new URL((raw ?? '').trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  if (!/^[a-z0-9-]+\.(api-us1\.com|activehosted\.com)$/i.test(u.hostname)) return null;
  return `https://${u.hostname.toLowerCase()}/api/3`;
}

export class ActiveCampaignConnector implements AudienceConnector {
  readonly name = 'ActiveCampaign';
  constructor(
    private readonly apiKey: string,
    private readonly base: string,
    /** The account's API URL as entered, to name the account by. */
    private readonly accountUrl?: string,
  ) {}

  private req(path: string, method = 'GET', body?: unknown) {
    return call(`${this.base}${path}`, { method, headers: { 'Api-Token': this.apiKey }, body }, this.name);
  }

  async account() {
    const { json } = await this.req('/users/me');
    const user = (json.user ?? {}) as { username?: string; email?: string };
    let host = '';
    try {
      host = new URL(this.accountUrl ?? this.base).hostname.split('.')[0];
    } catch {
      /* not a URL */
    }
    return host || user.email || user.username || 'ActiveCampaign';
  }

  async lists() {
    const { json } = await this.req('/lists?limit=100');
    return ((json.lists as { id: string; name: string }[] | undefined) ?? []).map((l) => ({ id: String(l.id), name: l.name }));
  }

  accepts(c: AudienceContact) {
    return !!c.email;
  }

  async upsert(c: AudienceContact, listId: string) {
    const { json } = await this.req('/contact/sync', 'POST', {
      contact: { email: c.email, ...(c.firstName ? { firstName: c.firstName } : {}), ...(c.lastName ? { lastName: c.lastName } : {}), ...(c.phone ? { phone: c.phone } : {}) },
    });
    const id = String((json.contact as { id?: string | number } | undefined)?.id ?? '');
    if (!id) throw new AudienceError('ActiveCampaign did not return the contact', 502);
    await this.req('/contactLists', 'POST', { contactList: { list: listId, contact: id, status: 1 } });
    return id;
  }
}

// ------------------------------------------------------------------- Klaviyo

const KLAVIYO_REVISION = '2024-10-15';

export class KlaviyoConnector implements AudienceConnector {
  readonly name = 'Klaviyo';
  constructor(
    private readonly apiKey: string,
    private readonly base = 'https://a.klaviyo.com/api',
  ) {}

  private req(path: string, method = 'GET', body?: unknown) {
    return call(
      `${this.base}${path}`,
      {
        method,
        headers: { authorization: `Klaviyo-API-Key ${this.apiKey}`, revision: KLAVIYO_REVISION, accept: 'application/vnd.api+json', 'content-type': 'application/vnd.api+json' },
        body,
      },
      this.name,
    );
  }

  async account() {
    const { json } = await this.req('/accounts/');
    const first = (json.data as { attributes?: { contact_information?: { organization_name?: string; default_sender_email?: string } } }[] | undefined)?.[0];
    const info = first?.attributes?.contact_information;
    return info?.organization_name || info?.default_sender_email || 'Klaviyo';
  }

  async lists() {
    const { json } = await this.req('/lists/');
    return ((json.data as { id: string; attributes?: { name?: string } }[] | undefined) ?? []).map((l) => ({ id: l.id, name: l.attributes?.name ?? l.id }));
  }

  /** Klaviyo knows a person by their email or their number. */
  accepts(c: AudienceContact) {
    return !!c.email || !!c.phone;
  }

  async upsert(c: AudienceContact, listId: string) {
    const attributes: Record<string, string> = {};
    if (c.email) attributes.email = c.email;
    if (c.phone) attributes.phone_number = c.phone;
    if (c.firstName) attributes.first_name = c.firstName;
    if (c.lastName) attributes.last_name = c.lastName;
    if (c.company) attributes.organization = c.company;
    const { json } = await this.req('/profile-import/', 'POST', { data: { type: 'profile', attributes } });
    const id = String((json.data as { id?: string } | undefined)?.id ?? '');
    if (!id) throw new AudienceError('Klaviyo did not return the profile', 502);
    // On the list, not subscribed: being on a list is not consent to marketing email.
    await this.req(`/lists/${encodeURIComponent(listId)}/relationships/profiles/`, 'POST', { data: [{ type: 'profile', id }] });
    return id;
  }
}
