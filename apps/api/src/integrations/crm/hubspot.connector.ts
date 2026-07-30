/**
 * Real HubSpot CRM connector. Talks to the actual HubSpot Contacts v3 REST API
 * with the OAuth access token the framework provides. The base URL is
 * overridable (OAUTH_HUBSPOT_API_URL) for sandbox/regional instances and for
 * integration testing against a local server that speaks the same protocol.
 *
 * Nothing here is mocked: given a valid token and base URL, these are genuine
 * HTTP calls that create/update contacts in HubSpot.
 */
export interface CrmContactResult {
  externalId: string;
}

const REQUEST_TIMEOUT_MS = 12_000;

export class HubSpotConnector {
  readonly provider = 'hubspot';

  constructor(private readonly baseUrl: string) {}

  private async call(
    method: 'POST' | 'PATCH',
    path: string,
    token: string,
    properties: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ properties }),
        signal: controller.signal,
      });
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        /* non-JSON error body */
      }
      if (!res.ok) {
        const msg = (json.message as string) || `HTTP ${res.status}`;
        throw new Error(`HubSpot ${method} ${path} failed: ${msg}`);
      }
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Creates a new contact and returns its HubSpot id. */
  async createContact(token: string, properties: Record<string, string>): Promise<CrmContactResult> {
    const json = await this.call('POST', '/crm/v3/objects/contacts', token, properties);
    return { externalId: String(json.id) };
  }

  /** Updates an existing contact by its HubSpot id. */
  async updateContact(
    token: string,
    externalId: string,
    properties: Record<string, string>,
  ): Promise<CrmContactResult> {
    const json = await this.call('PATCH', `/crm/v3/objects/contacts/${externalId}`, token, properties);
    return { externalId: String(json.id ?? externalId) };
  }
}
