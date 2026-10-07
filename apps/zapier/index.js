'use strict';

/**
 * The Vertex Connect app for Zapier (Zapier Platform CLI). It signs in with a
 * workspace API key, starts Zaps from the workspace's events through REST
 * hooks (POST/DELETE /zapier/hooks), and adds leads, notes and tasks.
 *
 * Where the API lives is set per deployment, before `zapier push`:
 *   zapier env:set 1.0.0 VERTEX_API_URL=https://api.your-domain.com/api
 */

const API = () => (process.env.VERTEX_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');

// ---- Signing in ----------------------------------------------------------

const authentication = {
  type: 'custom',
  fields: [
    {
      key: 'apiKey',
      label: 'API key',
      required: true,
      type: 'password',
      helpText:
        'In Vertex Connect, open **Integrations › API keys** and create a key for Zapier with the CRM and integration permissions (read and write).',
    },
  ],
  test: { url: '{{process.env.VERTEX_API_URL}}/zapier/me' },
  connectionLabel: '{{workspace}}',
};

/** Every request carries the key. */
const addKey = (request, z, bundle) => {
  if (bundle.authData && bundle.authData.apiKey) {
    request.headers = { ...request.headers, Authorization: `Bearer ${bundle.authData.apiKey}` };
  }
  return request;
};

/** Says what went wrong in Vertex's own words. */
const explainErrors = (response, z) => {
  if (response.status === 401) throw new z.errors.RefreshAuthError('The API key was revoked or has expired. Reconnect with a new one.');
  if (response.status >= 400) {
    let message = `Vertex Connect answered ${response.status}`;
    try {
      const body = typeof response.json === 'object' ? response.json : JSON.parse(response.content);
      if (body && body.message) message = Array.isArray(body.message) ? body.message.join(', ') : String(body.message);
    } catch (e) {
      // not JSON
    }
    throw new z.errors.Error(message, 'VertexError', response.status);
  }
  return response;
};

// ---- Triggers (REST hooks) -------------------------------------------------

/** One delivery, as a Zap sees it: the event's data, with its id and time. */
const fromDelivery = (body) => [{ id: body.id, event_created_at: body.createdAt, ...(body.data || {}) }];

const LEAD_FIELDS = [
  { key: 'leadId', label: 'Lead ID' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'source', label: 'Source' },
  { key: 'intent', label: 'What they asked for' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'cardSlug', label: 'Card' },
  { key: 'meetingAt', label: 'Meeting time', type: 'datetime' },
  { key: 'event_created_at', label: 'Received at', type: 'datetime' },
];

function hookTrigger({ key, event, noun, label, description, important, fields }) {
  return {
    key,
    noun,
    display: { label, description, important: !!important },
    operation: {
      type: 'hook',
      performSubscribe: async (z, bundle) => {
        const r = await z.request({ method: 'POST', url: `${API()}/zapier/hooks`, body: { hookUrl: bundle.targetUrl, event } });
        return r.data;
      },
      performUnsubscribe: async (z, bundle) => {
        const r = await z.request({ method: 'DELETE', url: `${API()}/zapier/hooks/${encodeURIComponent(bundle.subscribeData.id)}` });
        return r.data;
      },
      perform: async (z, bundle) => fromDelivery(bundle.cleanedRequest),
      performList: async (z, bundle) => {
        const r = await z.request({ url: `${API()}/zapier/samples/${event}` });
        return r.data;
      },
      sample: { id: `sample_${event}`, event_created_at: '2026-10-07T09:00:00.000Z', leadId: 'cm_example_lead', name: 'Laila Hassan', email: 'laila@example.com' },
      outputFields: fields,
    },
  };
}

const triggers = [
  hookTrigger({ key: 'new_lead', event: 'lead.created', noun: 'Lead', label: 'New Lead', description: 'Starts when someone leaves their details on a card, or a lead is added.', important: true, fields: LEAD_FIELDS }),
  hookTrigger({ key: 'meeting_requested', event: 'meeting.requested', noun: 'Meeting Request', label: 'New Meeting Request', description: 'Starts when a visitor asks for a meeting from a card.', important: true, fields: LEAD_FIELDS }),
  hookTrigger({ key: 'quote_requested', event: 'quote.requested', noun: 'Quote Request', label: 'New Quote Request', description: 'Starts when a visitor asks for a quote from a card.', fields: LEAD_FIELDS }),
  hookTrigger({ key: 'contact_saved', event: 'contact.saved', noun: 'Saved Contact', label: 'Contact Saved', description: 'Starts when a visitor saves a card’s contact to their phone.', fields: [{ key: 'slug', label: 'Card' }, { key: 'visitorId', label: 'Visitor' }] }),
  hookTrigger({ key: 'card_viewed', event: 'card.viewed', noun: 'Card View', label: 'Card Viewed', description: 'Starts when someone opens a card.', fields: [{ key: 'slug', label: 'Card' }, { key: 'visitorId', label: 'Visitor' }, { key: 'referrer', label: 'Came from' }] }),
];

// ---- Actions ----------------------------------------------------------------

const createLead = {
  key: 'create_lead',
  noun: 'Lead',
  display: { label: 'Create Lead', description: 'Adds a lead to Vertex Connect, assigned to the key’s owner.', important: true },
  operation: {
    inputFields: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'company', label: 'Company' },
    ],
    perform: async (z, bundle) => {
      const d = bundle.inputData;
      if (!d.name && !d.email && !d.phone) throw new z.errors.Error('Give the lead a name, an email or a phone number.', 'InvalidData', 400);
      // Shown in Vertex as having come from Zapier.
      const body = { source: 'zapier' };
      for (const k of ['name', 'email', 'phone', 'company']) if (d[k]) body[k] = d[k];
      const r = await z.request({ method: 'POST', url: `${API()}/leads`, body });
      return r.data;
    },
    sample: { id: 'cm_example_lead', name: 'Laila Hassan', email: 'laila@example.com' },
  },
};

const addNote = {
  key: 'add_note',
  noun: 'Note',
  display: { label: 'Add Note or Activity to Lead', description: 'Logs a note, call, email or meeting on a lead.' },
  operation: {
    inputFields: [
      { key: 'leadId', label: 'Lead ID', required: true },
      { key: 'type', label: 'Type', choices: { NOTE: 'Note', CALL: 'Call', EMAIL: 'Email', MEETING: 'Meeting' }, default: 'NOTE' },
      { key: 'note', label: 'Text', required: true, type: 'text' },
    ],
    perform: async (z, bundle) => {
      const { leadId, type, note } = bundle.inputData;
      const r = await z.request({ method: 'POST', url: `${API()}/leads/${encodeURIComponent(leadId)}/activities`, body: { type: type || 'NOTE', note } });
      return r.data;
    },
    sample: { id: 'cm_example_activity', type: 'NOTE', metadata: { note: 'Wants a demo next week' } },
  },
};

const createTask = {
  key: 'create_task',
  noun: 'Task',
  display: { label: 'Create Task', description: 'Adds a follow-up task, on a lead if one is given.' },
  operation: {
    inputFields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'leadId', label: 'Lead ID' },
      { key: 'dueDate', label: 'Due', type: 'datetime' },
      { key: 'priority', label: 'Priority', choices: { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' } },
    ],
    perform: async (z, bundle) => {
      const d = bundle.inputData;
      const body = { title: d.title };
      if (d.leadId) body.leadId = d.leadId;
      if (d.dueDate) body.dueDate = new Date(d.dueDate).toISOString();
      if (d.priority) body.priority = d.priority;
      const r = await z.request({ method: 'POST', url: `${API()}/tasks`, body });
      return r.data;
    },
    sample: { id: 'cm_example_task', title: 'Send the offer' },
  },
};

const pkg = require('./package.json');

module.exports = {
  version: pkg.version,
  platformVersion: pkg.dependencies['zapier-platform-core'],
  authentication,
  beforeRequest: [addKey],
  afterResponse: [explainErrors],
  triggers: Object.fromEntries(triggers.map((t) => [t.key, t])),
  creates: { [createLead.key]: createLead, [addNote.key]: addNote, [createTask.key]: createTask },
};
