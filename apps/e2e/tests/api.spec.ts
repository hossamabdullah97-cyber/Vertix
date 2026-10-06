import { API_ENDPOINTS, type ApiEndpoint } from '@vertex/shared/dist/api-reference';
import { API, expect, test } from './support';

/** Calls the API as an integration would: with a key, no session. */
async function withKey(key: string, method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as any };
}

const doc = (id: string) => API_ENDPOINTS.find((e) => e.id === id) as ApiEndpoint;

/** What the reference shows back is there, at least at the top level. */
function looksLike(actual: unknown, example: unknown) {
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const a = one(actual) as Record<string, unknown> | undefined;
  const e = one(example) as Record<string, unknown> | undefined;
  if (!a || !e || typeof e !== 'object') return;
  expect({ missing: Object.keys(e).filter((k) => !(k in a)), has: Object.keys(a) }).toMatchObject({ missing: [] });
}

test('every documented endpoint answers an API key as the reference says', async ({ account }) => {
  const created = await account.api<{ key: string }>('/api-keys', {
    body: { name: 'E2E docs', scopes: ['crm:read', 'crm:write', 'cards:read', 'cards:write', 'nfc:read', 'integration:read', 'integration:write'] },
  });
  expect(created.status).toBe(201);
  const key = created.data.key;
  const call = async (id: string, path = doc(id).path, body?: unknown) => {
    const e = doc(id);
    const r = await withKey(key, e.method, path, body);
    expect({ id, status: r.status, data: r.status >= 400 ? r.data : undefined }).toEqual({ id, status: e.status, data: undefined });
    looksLike(r.data, e.response);
    return r.data;
  };

  // Leads.
  const lead = await call('createLead', undefined, doc('createLead').request);
  expect((await call('listLeads')).map((l: { id: string }) => l.id)).toContain(lead.id);
  await call('getLead', `/leads/${lead.id}`);
  const stages = await call('listStages');
  await call('updateLead', `/leads/${lead.id}`, { stageId: stages[1].id, temperature: 'HOT', value: 40000 });
  await call('addLeadActivity', `/leads/${lead.id}/activities`, doc('addLeadActivity').request);
  await call('listFields');
  // A wrong value is a clear 400, not a server error.
  const bad = await withKey(key, 'PATCH', `/leads/${lead.id}`, { temperature: 'BOILING' });
  expect(bad.status).toBe(400);

  // Tasks.
  const task = await call('createTask', undefined, { ...(doc('createTask').request as object), leadId: lead.id });
  expect((await call('listTasks', `/tasks?leadId=${lead.id}`)).map((t: { id: string }) => t.id)).toEqual([task.id]);
  await call('updateTask', `/tasks/${task.id}`, { completed: true });
  await call('deleteTask', `/tasks/${task.id}`);

  // Cards.
  await call('createCard', undefined, { ...(doc('createCard').request as object), slug: `e2e-api-${Date.now()}` });
  await call('listCards');

  // Chips.
  await call('listChips');
  expect((await withKey(key, 'GET', '/nfc/tags?status=LOST')).status).toBe(400);
  expect((await withKey(key, 'GET', '/nfc/tags/nope')).status).toBe(404);

  // Webhooks: the secret comes back once.
  const hook = await call('createWebhook', undefined, doc('createWebhook').request);
  expect(hook.secret).toMatch(/^whsec_/);
  expect((await call('listWebhooks'))[0]).not.toHaveProperty('secret');

  // A narrow key reaches only what it was given, and a wrong key nothing.
  const narrow = (await account.api<{ key: string }>('/api-keys', { body: { name: 'E2E read only', scopes: ['crm:read'] } })).data.key;
  expect((await withKey(narrow, 'GET', '/leads')).status).toBe(200);
  const denied = await withKey(narrow, 'POST', '/leads', { name: 'X' });
  expect(denied).toMatchObject({ status: 403, data: { message: 'This token is missing the required scope(s): crm:write' } });
  expect((await withKey(narrow, 'GET', '/billing/subscription')).status).toBe(403);
  expect((await withKey('vxk_live_' + '0'.repeat(48), 'GET', '/leads')).status).toBe(401);
});

test('the OpenAPI document is public and names every documented operation', async () => {
  const res = await fetch(`${API}/openapi.json`);
  expect(res.status).toBe(200);
  const spec = (await res.json()) as { openapi: string; servers: { url: string }[]; paths: Record<string, Record<string, { operationId: string }>> };
  expect(spec.openapi).toBe('3.1.0');
  expect(spec.servers[0]!.url).toMatch(/\/api$/);
  const ops = Object.values(spec.paths).flatMap((p) => Object.values(p).map((o) => o.operationId));
  expect(ops.sort()).toEqual(API_ENDPOINTS.map((e) => e.id).sort());
});
