/**
 * Predefined automation templates (section 25). Each is a ready-to-use starting
 * point the UI can prefill into the builder — the user still reviews and saves
 * it, and fills in any placeholder (like a Slack webhook URL). Nothing here is
 * active until saved as a real Automation.
 */
export interface AutomationTemplate {
  key: string;
  name: string;
  description: string;
  trigger: string;
  matchType: 'ALL' | 'ANY';
  conditions: Array<{ field: string; operator: string; value?: unknown }>;
  actions: Array<{ type: string; config: Record<string, unknown> }>;
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    key: 'new-lead-notify',
    name: 'New lead → notify the team',
    description: 'Post an in-app notification to workspace admins whenever a lead is captured.',
    trigger: 'lead.created',
    matchType: 'ALL',
    conditions: [],
    actions: [{ type: 'notify', config: { title: 'New lead captured', body: 'A new lead just came in from a card.' } }],
  },
  {
    key: 'new-lead-slack',
    name: 'New lead → Slack / Zapier',
    description: 'Forward every new lead to a Slack incoming webhook (or Zapier/Make/n8n).',
    trigger: 'lead.created',
    matchType: 'ALL',
    conditions: [],
    actions: [{ type: 'webhook', config: { url: 'https://hooks.slack.com/services/XXXX' } }],
  },
  {
    key: 'hot-lead-task',
    name: 'Hot lead → follow-up task',
    description: 'Create a CRM task to follow up within a day when a high-intent lead arrives.',
    trigger: 'lead.created',
    matchType: 'ALL',
    conditions: [{ field: 'data.temperature', operator: 'equals', value: 'HOT' }],
    actions: [{ type: 'task', config: { title: 'Follow up with hot lead', dueInDays: 1 } }],
  },
  {
    key: 'nfc-tap-forward',
    name: 'NFC tap → external webhook',
    description: 'Forward every physical NFC tap to an external endpoint.',
    trigger: 'nfc.tapped',
    matchType: 'ALL',
    conditions: [],
    actions: [{ type: 'webhook', config: { url: 'https://example.com/hooks/nfc' } }],
  },
  {
    key: 'meeting-request-notify',
    name: 'Meeting request → notify',
    description: 'Alert the team when someone requests a meeting from a card.',
    trigger: 'meeting.requested',
    matchType: 'ALL',
    conditions: [],
    actions: [{ type: 'notify', config: { title: 'Meeting requested', body: 'A visitor requested a meeting.' } }],
  },
  {
    key: 'new-member-forward',
    name: 'New member → external webhook',
    description: 'Notify an external system (HR, Slack) when a member joins the workspace.',
    trigger: 'member.added',
    matchType: 'ALL',
    conditions: [],
    actions: [{ type: 'webhook', config: { url: 'https://example.com/hooks/member' } }],
  },
];
