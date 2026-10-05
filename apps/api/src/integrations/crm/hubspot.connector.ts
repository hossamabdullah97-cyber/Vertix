import { request, type ConnectorAuth, type CrmConnector } from './connectors';

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

export class HubSpotConnector implements CrmConnector {
  readonly provider = 'hubspot';

  constructor(private readonly baseUrl: string) {}

  private async call(method: 'POST' | 'PATCH', path: string, token: string, properties: Record<string, string>): Promise<Record<string, unknown>> {
    const { json } = await request('HubSpot', `${this.baseUrl}${path}`, { method, headers: { authorization: `Bearer ${token}` }, body: { properties } });
    return json as Record<string, unknown>;
  }

  /** Creates a new contact and returns its HubSpot id. */
  async createContact(auth: ConnectorAuth, properties: Record<string, string>): Promise<CrmContactResult> {
    const json = await this.call('POST', '/crm/v3/objects/contacts', auth.token, properties);
    return { externalId: String(json.id) };
  }

  /** Updates an existing contact by its HubSpot id. */
  async updateContact(auth: ConnectorAuth, externalId: string, properties: Record<string, string>): Promise<CrmContactResult> {
    const json = await this.call('PATCH', `/crm/v3/objects/contacts/${externalId}`, auth.token, properties);
    return { externalId: String(json.id ?? externalId) };
  }
}
