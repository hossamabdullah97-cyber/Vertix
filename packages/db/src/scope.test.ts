import { describe, it, expect } from 'vitest';
import { applyScope, TENANT_MODELS, SOFT_DELETE_MODELS } from './scope';
import type { TenantContext } from './tenant-context';

/**
 * These cover the boundary that keeps one organization's rows invisible to
 * another. A regression here is a cross-tenant data leak, so the tests assert
 * the rewritten query args directly rather than trusting a round trip.
 */

const acme: TenantContext = { orgId: 'org_acme', userId: 'u1', role: 'OWNER' };
const globex: TenantContext = { orgId: 'org_globex', userId: 'u2', role: 'OWNER' };
const platformAdmin: TenantContext = { orgId: 'admin', userId: 'root', role: 'OWNER' };

describe('applyScope — reads', () => {
  it('scopes every read of a tenant model to the active organization', () => {
    const out = applyScope('Card', 'findMany', { where: { isPublished: true } }, acme);
    expect(out.where).toEqual({
      deletedAt: null,
      isPublished: true,
      orgId: 'org_acme',
    });
  });

  it('scopes a read with no where clause at all', () => {
    expect(applyScope('Lead', 'findMany', {}, acme).where).toEqual({
      deletedAt: null,
      orgId: 'org_acme',
    });
  });

  it('overrides a caller-supplied orgId instead of trusting it', () => {
    // The injected value must win, or a caller could read another org's rows
    // just by naming them.
    const out = applyScope(
      'Lead',
      'findMany',
      { where: { orgId: 'org_globex' } },
      acme,
    );
    expect(out.where?.orgId).toBe('org_acme');
  });

  it('scopes findUnique too, so an id from another org resolves to nothing', () => {
    const out = applyScope('Card', 'findUnique', { where: { id: 'card_123' } }, acme);
    expect(out.where).toEqual({ deletedAt: null, id: 'card_123', orgId: 'org_acme' });
  });

  it('scopes aggregates, so counts cannot be used to probe other tenants', () => {
    for (const op of ['count', 'aggregate', 'groupBy']) {
      expect(applyScope('Event', op, {}, acme).where).toMatchObject({
        orgId: 'org_acme',
      });
    }
  });
});

describe('applyScope — writes', () => {
  it('stamps the active org on create', () => {
    const out = applyScope('Card', 'create', { data: { slug: 'jane' } }, acme);
    expect(out.data).toEqual({ slug: 'jane', orgId: 'org_acme' });
  });

  it('overrides an orgId passed into create', () => {
    const out = applyScope(
      'Card',
      'create',
      { data: { slug: 'jane', orgId: 'org_globex' } },
      acme,
    );
    expect((out.data as { orgId: string }).orgId).toBe('org_acme');
  });

  it('stamps every row of a createMany', () => {
    const out = applyScope(
      'PipelineStage',
      'createMany',
      { data: [{ name: 'New' }, { name: 'Won' }] },
      acme,
    );
    expect(out.data).toEqual([
      { name: 'New', orgId: 'org_acme' },
      { name: 'Won', orgId: 'org_acme' },
    ]);
  });

  it('scopes update and delete, so a foreign id cannot be written or removed', () => {
    for (const op of ['update', 'updateMany', 'delete', 'deleteMany']) {
      const out = applyScope('Lead', op, { where: { id: 'lead_from_globex' } }, acme);
      expect(out.where?.orgId).toBe('org_acme');
    }
  });

  it('scopes both halves of an upsert', () => {
    const out = applyScope(
      'Subscription',
      'upsert',
      { where: { id: 's1' }, create: { plan: 'PRO' }, data: { plan: 'PRO' } },
      acme,
    );
    expect(out.where?.orgId).toBe('org_acme');
    expect(out.create?.orgId).toBe('org_acme');
  });
});

describe('applyScope — the platform-admin escape hatch', () => {
  it('does not scope reads for the admin sentinel', () => {
    const out = applyScope('Card', 'findMany', {}, platformAdmin);
    expect(out.where?.orgId).toBeUndefined();
  });

  it('does not stamp writes for the admin sentinel, so it can seed another org', () => {
    const out = applyScope(
      'Membership',
      'create',
      { data: { userId: 'u9', orgId: 'org_new', role: 'OWNER' } },
      platformAdmin,
    );
    // Without this, an admin creating an org would write the membership into
    // their OWN org — the bug that made "Create Organization" silently wrong.
    expect((out.data as { orgId: string }).orgId).toBe('org_new');
  });

  it('still applies soft delete for the admin sentinel', () => {
    expect(applyScope('Card', 'findMany', {}, platformAdmin).where).toEqual({
      deletedAt: null,
    });
  });
});

describe('applyScope — no tenant context', () => {
  it('leaves queries untouched when there is no context (public card pages)', () => {
    const out = applyScope('Card', 'findMany', { where: { slug: 'jane' } }, undefined);
    expect(out.where).toEqual({ deletedAt: null, slug: 'jane' });
  });
});

describe('applyScope — model classification', () => {
  it('never injects orgId into models that have no such column', () => {
    // User spans organizations and Organization is the tenant itself; injecting
    // orgId here would be a query error, not a leak.
    for (const model of ['User', 'Organization']) {
      expect(TENANT_MODELS.has(model)).toBe(false);
      expect(applyScope(model, 'findMany', {}, acme).where?.orgId).toBeUndefined();
    }
  });

  it('does not soft-delete-filter append-only log tables', () => {
    for (const model of ['Event', 'AuditLog', 'Visitor', 'LeadActivity']) {
      expect(SOFT_DELETE_MODELS.has(model)).toBe(false);
      expect(
        applyScope(model, 'findMany', {}, acme).where?.deletedAt,
      ).toBeUndefined();
    }
  });

  it('lets a caller opt into seeing soft-deleted rows', () => {
    // The spread order puts the caller's deletedAt last, so an explicit filter
    // wins — this is how the admin console restores a deleted organization.
    const out = applyScope(
      'Organization',
      'findMany',
      { where: { deletedAt: { not: null } } },
      acme,
    );
    expect(out.where?.deletedAt).toEqual({ not: null });
  });

  it('but never lets that trick widen the tenant scope', () => {
    const out = applyScope(
      'Card',
      'findMany',
      { where: { deletedAt: { not: null }, orgId: 'org_globex' } },
      acme,
    );
    expect(out.where?.orgId).toBe('org_acme');
  });
});

describe('applyScope — integration models', () => {
  it('scopes integration connections, webhook endpoints and API keys to the org', () => {
    for (const model of ['IntegrationConnection', 'WebhookEndpoint', 'ApiKey']) {
      expect(TENANT_MODELS.has(model)).toBe(true);
      expect(applyScope(model, 'findMany', {}, acme).where?.orgId).toBe('org_acme');
    }
  });

  it('scopes webhook deliveries but never soft-delete-filters them (append-only)', () => {
    expect(TENANT_MODELS.has('WebhookDelivery')).toBe(true);
    expect(SOFT_DELETE_MODELS.has('WebhookDelivery')).toBe(false);
    const out = applyScope('WebhookDelivery', 'findMany', {}, acme);
    expect(out.where?.orgId).toBe('org_acme');
    expect(out.where?.deletedAt).toBeUndefined();
  });

  it('scopes automations, and soft-deletes them but not their run log', () => {
    expect(TENANT_MODELS.has('Automation')).toBe(true);
    expect(SOFT_DELETE_MODELS.has('Automation')).toBe(true);
    expect(applyScope('Automation', 'findMany', {}, acme).where?.orgId).toBe('org_acme');

    expect(TENANT_MODELS.has('AutomationRun')).toBe(true);
    expect(SOFT_DELETE_MODELS.has('AutomationRun')).toBe(false);
    const run = applyScope('AutomationRun', 'findMany', {}, acme);
    expect(run.where?.orgId).toBe('org_acme');
    expect(run.where?.deletedAt).toBeUndefined();
  });

  it('does NOT tenant-scope personal access tokens — they belong to a user', () => {
    // A PAT spans all of a person's workspaces, like User itself; injecting an
    // orgId would hide a user's own token from them in another workspace.
    expect(TENANT_MODELS.has('PersonalAccessToken')).toBe(false);
    expect(
      applyScope('PersonalAccessToken', 'findMany', {}, acme).where?.orgId,
    ).toBeUndefined();
  });

  it('stamps the org when a webhook endpoint is created', () => {
    const out = applyScope('WebhookEndpoint', 'create', { data: { url: 'https://x' } }, acme);
    expect((out.data as { orgId: string }).orgId).toBe('org_acme');
  });
});

describe('applyScope — isolation between two tenants', () => {
  it('produces different scopes for different contexts on the same query', () => {
    const q = { where: { isPublished: true } };
    expect(applyScope('Card', 'findMany', q, acme).where?.orgId).toBe('org_acme');
    expect(applyScope('Card', 'findMany', q, globex).where?.orgId).toBe('org_globex');
  });

  it('does not mutate the caller-supplied args object', () => {
    const q = { where: { isPublished: true } };
    applyScope('Card', 'findMany', q, acme);
    expect(q.where).toEqual({ isPublished: true });
  });
});
