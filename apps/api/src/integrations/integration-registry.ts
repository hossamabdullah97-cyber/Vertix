/**
 * The catalog of external providers the Integration Hub knows about. This is
 * static configuration — a description of what each provider IS and how it
 * authenticates — NOT live connection state (that lives per-tenant in
 * IntegrationConnection). Whether a given workspace is connected is always read
 * from the database, never from this file.
 *
 * `status` is honest about what actually works today:
 *   - 'available'   : a real connector exists and a workspace can connect it now
 *                     (subject to the org supplying its own credentials).
 *   - 'coming_soon' : catalogued and visible, but not yet connectable. Shown as
 *                     "Coming Soon" — never presented as connected.
 *
 * As each connector lands, flip its entry to 'available'. Nothing here fakes a
 * connection.
 */

export type IntegrationCategory =
  | 'crm'
  | 'marketing'
  | 'communication'
  | 'calendar'
  | 'productivity'
  | 'storage'
  | 'automation'
  | 'analytics'
  | 'payments';

/** How a workspace authenticates the provider. */
export type IntegrationAuthMethod =
  | 'oauth2' // full OAuth 2.0 authorization-code flow (needs a registered app)
  | 'api_key' // a token/key the org pastes in (e.g. HubSpot private-app token)
  | 'webhook_url' // an inbound URL the org provides (Slack, Zapier, Make, n8n)
  | 'none';

export type IntegrationStatusFlag = 'available' | 'coming_soon';

export interface IntegrationProviderDef {
  /** Stable key used in IntegrationConnection.provider and the API. */
  key: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  auth: IntegrationAuthMethod;
  status: IntegrationStatusFlag;
  /** What the integration can access, shown on the permissions review step. */
  scopes: string[];
  /** Marketing flag for the "Popular" marketplace filter. */
  popular?: boolean;
  docsUrl?: string;
}

export const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  crm: 'CRM',
  marketing: 'Marketing',
  communication: 'Communication',
  calendar: 'Calendar',
  productivity: 'Productivity',
  storage: 'Storage',
  automation: 'Automation',
  analytics: 'Analytics',
  payments: 'Payments',
};

/** The catalog. Every provider from the spec, grouped by category. */
export const INTEGRATION_REGISTRY: IntegrationProviderDef[] = [
  // --- CRM ---
  { key: 'hubspot', name: 'HubSpot', category: 'crm', auth: 'oauth2', status: 'coming_soon', popular: true, description: 'Sync leads and contacts with HubSpot CRM.', scopes: ['Contacts', 'Companies', 'Deals'] },
  { key: 'salesforce', name: 'Salesforce', category: 'crm', auth: 'oauth2', status: 'coming_soon', popular: true, description: 'Push leads and meetings into Salesforce.', scopes: ['Leads', 'Contacts', 'Events'] },
  { key: 'zoho_crm', name: 'Zoho CRM', category: 'crm', auth: 'oauth2', status: 'coming_soon', description: 'Two-way contact and lead sync with Zoho CRM.', scopes: ['Contacts', 'Leads'] },
  { key: 'pipedrive', name: 'Pipedrive', category: 'crm', auth: 'oauth2', status: 'coming_soon', description: 'Sync deals and people with Pipedrive.', scopes: ['Persons', 'Deals'] },
  { key: 'dynamics', name: 'Microsoft Dynamics', category: 'crm', auth: 'oauth2', status: 'coming_soon', description: 'Connect leads to Dynamics 365 Sales.', scopes: ['Leads', 'Contacts'] },

  // --- Marketing ---
  { key: 'mailchimp', name: 'Mailchimp', category: 'marketing', auth: 'oauth2', status: 'coming_soon', popular: true, description: 'Add captured contacts to Mailchimp audiences.', scopes: ['Audiences', 'Contacts'] },
  { key: 'brevo', name: 'Brevo', category: 'marketing', auth: 'api_key', status: 'coming_soon', description: 'Sync contacts into Brevo (Sendinblue) lists.', scopes: ['Contacts', 'Lists'] },
  { key: 'klaviyo', name: 'Klaviyo', category: 'marketing', auth: 'api_key', status: 'coming_soon', description: 'Push profiles and events to Klaviyo.', scopes: ['Profiles', 'Events'] },
  { key: 'activecampaign', name: 'ActiveCampaign', category: 'marketing', auth: 'api_key', status: 'coming_soon', description: 'Sync contacts into ActiveCampaign automations.', scopes: ['Contacts', 'Lists'] },

  // --- Communication ---
  { key: 'slack', name: 'Slack', category: 'communication', auth: 'webhook_url', status: 'coming_soon', popular: true, description: 'Send lead and event notifications to a Slack channel.', scopes: ['Post messages'] },
  { key: 'ms_teams', name: 'Microsoft Teams', category: 'communication', auth: 'webhook_url', status: 'coming_soon', description: 'Post workspace events to a Teams channel.', scopes: ['Post messages'] },
  { key: 'whatsapp_business', name: 'WhatsApp Business', category: 'communication', auth: 'oauth2', status: 'coming_soon', description: 'Notify and message contacts via WhatsApp Business.', scopes: ['Send messages'] },
  { key: 'telegram', name: 'Telegram', category: 'communication', auth: 'api_key', status: 'coming_soon', description: 'Send event notifications via a Telegram bot.', scopes: ['Send messages'] },

  // --- Calendar ---
  { key: 'google_calendar', name: 'Google Calendar', category: 'calendar', auth: 'oauth2', status: 'coming_soon', popular: true, description: 'Turn meeting requests into calendar events.', scopes: ['Calendar events'] },
  { key: 'outlook_calendar', name: 'Outlook Calendar', category: 'calendar', auth: 'oauth2', status: 'coming_soon', description: 'Create events in Microsoft Outlook Calendar.', scopes: ['Calendar events'] },
  { key: 'calendly', name: 'Calendly', category: 'calendar', auth: 'oauth2', status: 'coming_soon', description: 'Link Calendly bookings to leads.', scopes: ['Scheduled events'] },

  // --- Productivity ---
  { key: 'google_workspace', name: 'Google Workspace', category: 'productivity', auth: 'oauth2', status: 'coming_soon', description: 'Connect Google Workspace directory and contacts.', scopes: ['Directory', 'Contacts'] },
  { key: 'microsoft_365', name: 'Microsoft 365', category: 'productivity', auth: 'oauth2', status: 'coming_soon', description: 'Connect Microsoft 365 directory and contacts.', scopes: ['Directory', 'Contacts'] },
  { key: 'notion', name: 'Notion', category: 'productivity', auth: 'oauth2', status: 'coming_soon', description: 'Log leads into a Notion database.', scopes: ['Databases', 'Pages'] },
  { key: 'trello', name: 'Trello', category: 'productivity', auth: 'oauth2', status: 'coming_soon', description: 'Create Trello cards from new leads.', scopes: ['Boards', 'Cards'] },
  { key: 'asana', name: 'Asana', category: 'productivity', auth: 'oauth2', status: 'coming_soon', description: 'Turn leads into Asana tasks.', scopes: ['Projects', 'Tasks'] },
  { key: 'clickup', name: 'ClickUp', category: 'productivity', auth: 'oauth2', status: 'coming_soon', description: 'Create ClickUp tasks from workspace events.', scopes: ['Spaces', 'Tasks'] },

  // --- Storage ---
  { key: 'google_drive', name: 'Google Drive', category: 'storage', auth: 'oauth2', status: 'coming_soon', description: 'Store exported assets in Google Drive.', scopes: ['Files'] },
  { key: 'onedrive', name: 'OneDrive', category: 'storage', auth: 'oauth2', status: 'coming_soon', description: 'Store exported assets in OneDrive.', scopes: ['Files'] },
  { key: 'dropbox', name: 'Dropbox', category: 'storage', auth: 'oauth2', status: 'coming_soon', description: 'Store exported assets in Dropbox.', scopes: ['Files'] },

  // --- Automation ---
  { key: 'zapier', name: 'Zapier', category: 'automation', auth: 'webhook_url', status: 'coming_soon', popular: true, description: 'Trigger Zaps from Vertex Connect events via webhooks.', scopes: ['Receive events'] },
  { key: 'make', name: 'Make', category: 'automation', auth: 'webhook_url', status: 'coming_soon', description: 'Trigger Make scenarios from workspace events.', scopes: ['Receive events'] },
  { key: 'n8n', name: 'n8n', category: 'automation', auth: 'webhook_url', status: 'coming_soon', description: 'Trigger n8n workflows from workspace events.', scopes: ['Receive events'] },

  // --- Analytics ---
  { key: 'google_analytics', name: 'Google Analytics', category: 'analytics', auth: 'oauth2', status: 'coming_soon', description: 'Forward card and profile events to GA4.', scopes: ['Measurement'] },
  { key: 'google_tag_manager', name: 'Google Tag Manager', category: 'analytics', auth: 'oauth2', status: 'coming_soon', description: 'Manage tags for public card pages.', scopes: ['Containers'] },
  { key: 'meta_pixel', name: 'Meta Pixel', category: 'analytics', auth: 'api_key', status: 'coming_soon', description: 'Send card events to the Meta Pixel.', scopes: ['Events'] },
  { key: 'linkedin_insight', name: 'LinkedIn Insight Tag', category: 'analytics', auth: 'api_key', status: 'coming_soon', description: 'Track card visits with the LinkedIn Insight Tag.', scopes: ['Events'] },
];

const BY_KEY = new Map(INTEGRATION_REGISTRY.map((p) => [p.key, p]));

export function getProvider(key: string): IntegrationProviderDef | undefined {
  return BY_KEY.get(key);
}

export function isKnownProvider(key: string): boolean {
  return BY_KEY.has(key);
}

/** A provider is connectable only when its connector is actually implemented. */
export function isProviderAvailable(key: string): boolean {
  return BY_KEY.get(key)?.status === 'available';
}
