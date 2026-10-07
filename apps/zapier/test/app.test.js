'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.VERTEX_API_URL = 'https://api.example.com/api/';
const App = require('../index.js');

/** Zapier's `z`, as far as the app uses it: requests are recorded and answered. */
function fakeZ(answer = () => ({})) {
  const calls = [];
  class ZError extends Error {
    constructor(message, type, status) {
      super(message);
      this.type = type;
      this.status = status;
    }
  }
  return {
    calls,
    request: async (req) => {
      calls.push(req);
      return { status: 200, data: answer(req) };
    },
    errors: { Error: ZError, RefreshAuthError: class extends Error {} },
  };
}

test('every request carries the API key', () => {
  const [addKey] = App.beforeRequest;
  const req = addKey({ url: 'x', headers: { accept: 'application/json' } }, null, { authData: { apiKey: 'vxk_live_123' } });
  assert.equal(req.headers.Authorization, 'Bearer vxk_live_123');
  assert.equal(req.headers.accept, 'application/json');
});

test('the connection is tested and named by the workspace', () => {
  assert.equal(App.authentication.test.url, '{{process.env.VERTEX_API_URL}}/zapier/me');
  assert.equal(App.authentication.connectionLabel, '{{workspace}}');
});

test('turning a Zap on subscribes its hook to the event, and off removes it', async () => {
  const z = fakeZ(() => ({ id: 'w1', event: 'lead.created' }));
  const op = App.triggers.new_lead.operation;
  const sub = await op.performSubscribe(z, { targetUrl: 'https://hooks.zapier.com/hooks/standard/1/abc' });
  assert.deepEqual(sub, { id: 'w1', event: 'lead.created' });
  assert.deepEqual(z.calls[0], { method: 'POST', url: 'https://api.example.com/api/zapier/hooks', body: { hookUrl: 'https://hooks.zapier.com/hooks/standard/1/abc', event: 'lead.created' } });
  await op.performUnsubscribe(z, { subscribeData: { id: 'w1' } });
  assert.deepEqual(z.calls[1], { method: 'DELETE', url: 'https://api.example.com/api/zapier/hooks/w1' });
});

test('a delivery becomes one item: the event’s data, with its id and time', async () => {
  const items = await App.triggers.meeting_requested.operation.perform(fakeZ(), {
    cleanedRequest: { id: 'evt_1', event: 'meeting.requested', createdAt: '2026-10-07T09:00:00Z', data: { leadId: 'l1', name: 'Laila', meetingAt: '2026-10-08T08:00:00Z' } },
  });
  assert.deepEqual(items, [{ id: 'evt_1', event_created_at: '2026-10-07T09:00:00Z', leadId: 'l1', name: 'Laila', meetingAt: '2026-10-08T08:00:00Z' }]);
});

test('samples come from the workspace', async () => {
  const z = fakeZ(() => [{ id: 'sample_l1' }]);
  assert.deepEqual(await App.triggers.quote_requested.operation.performList(z, {}), [{ id: 'sample_l1' }]);
  assert.equal(z.calls[0].url, 'https://api.example.com/api/zapier/samples/quote.requested');
});

test('creating a lead sends only what was given, marked as from Zapier', async () => {
  const z = fakeZ(() => ({ id: 'l9' }));
  await App.creates.create_lead.operation.perform(z, { inputData: { name: 'Mona', email: '', company: 'Delta' } });
  assert.deepEqual(z.calls[0], { method: 'POST', url: 'https://api.example.com/api/leads', body: { source: 'zapier', name: 'Mona', company: 'Delta' } });
  await assert.rejects(App.creates.create_lead.operation.perform(z, { inputData: { company: 'Only a company' } }), /name, an email or a phone/);
});

test('a note and a task go to the lead', async () => {
  const z = fakeZ(() => ({}));
  await App.creates.add_note.operation.perform(z, { inputData: { leadId: 'l1', note: 'Called back' } });
  assert.deepEqual(z.calls[0], { method: 'POST', url: 'https://api.example.com/api/leads/l1/activities', body: { type: 'NOTE', note: 'Called back' } });
  await App.creates.create_task.operation.perform(z, { inputData: { title: 'Send offer', leadId: 'l1', dueDate: '2026-10-09T10:00:00Z', priority: 'HIGH' } });
  assert.deepEqual(z.calls[1].body, { title: 'Send offer', leadId: 'l1', dueDate: '2026-10-09T10:00:00.000Z', priority: 'HIGH' });
});

test('Vertex’s own error message reaches the Zap', () => {
  const [explain] = App.afterResponse;
  const z = fakeZ();
  assert.throws(() => explain({ status: 400, content: JSON.stringify({ message: ['Email is invalid'] }) }, z), /Email is invalid/);
  assert.throws(() => explain({ status: 401, content: '{}' }, z), /revoked or has expired/);
  assert.deepEqual(explain({ status: 200, content: '{}' }, z), { status: 200, content: '{}' });
});

test('the platform version is the one the app depends on', () => {
  assert.equal(App.platformVersion, require('../package.json').dependencies['zapier-platform-core']);
  assert.equal(App.version, '1.0.0');
});
