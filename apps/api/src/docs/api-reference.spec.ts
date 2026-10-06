import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { API_ENDPOINTS, WEBHOOK_EVENT_DOCS, openApiDocument, toOpenApiPath } from '@vertex/shared/dist/api-reference';
import { LeadsController } from '../leads/leads.controller';
import { TasksController } from '../tasks/tasks.controller';
import { CardsController } from '../cards/cards.controller';
import { TagsController } from '../nfc/tags.controller';
import { WebhooksController } from '../integrations/webhooks.controller';
import { SCOPES_KEY } from '../access/scopes.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { WEBHOOK_EVENTS } from '../integrations/webhook.service';

interface Route {
  method: string;
  path: string;
  scopes: string[];
  roles?: string[];
}

/** Every route a key could reach on the controllers the reference covers, as the app declares them. */
function routes(): Route[] {
  const out: Route[] = [];
  for (const ctrl of [LeadsController, TasksController, CardsController, TagsController, WebhooksController]) {
    const prefix = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? '');
    const classRoles = Reflect.getMetadata(ROLES_KEY, ctrl) as string[] | undefined;
    for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
      const fn = (ctrl.prototype as unknown as Record<string, unknown>)[name];
      if (typeof fn !== 'function' || name === 'constructor') continue;
      const path = Reflect.getMetadata(PATH_METADATA, fn) as string | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod | undefined;
      if (path === undefined || method === undefined) continue;
      const full = '/' + [prefix, path].map((p) => p.replace(/^\/|\/$/g, '')).filter(Boolean).join('/');
      out.push({
        method: RequestMethod[method],
        path: toOpenApiPath(full),
        scopes: (Reflect.getMetadata(SCOPES_KEY, fn) as string[] | undefined) ?? [],
        roles: (Reflect.getMetadata(ROLES_KEY, fn) as string[] | undefined) ?? classRoles,
      });
    }
  }
  return out;
}

/**
 * Routes a key can reach that the reference leaves out on purpose: they serve
 * the app's own screens (reviewing duplicates, reading a paper card, the
 * spreadsheet import's batches, managing fields) rather than integrations.
 */
const NOT_DOCUMENTED = [
  'PUT /leads/fields/order',
  'POST /leads/fields',
  'PATCH /leads/fields/{fieldId}',
  'DELETE /leads/fields/{fieldId}',
  'GET /leads/duplicates',
  'GET /leads/duplicates/dismissed',
  'POST /leads/duplicates/dismiss',
  'POST /leads/{id}/merge',
  'GET /leads/scan',
  'POST /leads/scan',
  'POST /leads/import',
  'GET /leads/notes',
  'GET /leads/{id}/mentionable',
  'PATCH /leads/{id}/notes/{noteId}',
  'DELETE /leads/{id}/notes/{noteId}',
  'POST /leads/{id}/contact',
  'POST /leads/{id}/meeting',
  'GET /leads/{id}/meeting.ics',
];

describe('the API reference', () => {
  const all = routes();
  const key = (r: { method: string; path: string }) => `${r.method} ${r.path}`;

  it('documents real routes, with the scope and roles they require', () => {
    for (const e of API_ENDPOINTS) {
      const r = all.find((x) => key(x) === key(e));
      expect(r ? key(r) : `missing: ${key(e)}`).toBe(key(e));
      expect({ route: key(e), scopes: r!.scopes }).toEqual({ route: key(e), scopes: [e.scope] });
      expect({ route: key(e), roles: e.roles ?? null }).toEqual({ route: key(e), roles: r!.roles && r!.roles.length < 4 ? r!.roles : null });
    }
  });

  it('leaves out only the routes it means to', () => {
    const documented = new Set(API_ENDPOINTS.map(key));
    const reachable = all.filter((r) => r.scopes.length).map(key);
    expect(reachable.filter((k) => !documented.has(k) && !NOT_DOCUMENTED.includes(k))).toEqual([]);
    for (const k of NOT_DOCUMENTED) expect(reachable).toContain(k);
  });

  it('names only events that exist', () => {
    for (const w of WEBHOOK_EVENT_DOCS) expect(WEBHOOK_EVENTS).toContain(w.event);
  });

  it('is a complete OpenAPI document', () => {
    const doc = openApiDocument('https://api.example.com/api') as { openapi: string; paths: Record<string, Record<string, { operationId: string }>>; webhooks: object };
    expect(doc.openapi).toBe('3.1.0');
    const ops = Object.values(doc.paths).flatMap((p) => Object.values(p).map((o) => o.operationId));
    expect(ops.sort()).toEqual(API_ENDPOINTS.map((e) => e.id).sort());
    expect(new Set(ops).size).toBe(ops.length);
    expect(Object.keys(doc.webhooks)).toEqual(WEBHOOK_EVENT_DOCS.map((w) => w.event));
  });
});
