import type { TenantContext } from './tenant-context';

/**
 * The query-rewriting rules behind multi-tenant isolation and soft delete.
 *
 * This lives apart from the Prisma client so it can be tested as a pure
 * function: it is the boundary that keeps one organization's rows invisible to
 * another, and a regression here is a data leak, not a bug report.
 */

/**
 * Models that support soft delete (they carry a deletedAt column).
 * Log tables (Event, LeadActivity, AuditLog, Visitor) are intentionally
 * excluded — they are append-only.
 */
export const SOFT_DELETE_MODELS = new Set<string>([
  'User',
  'Organization',
  'Membership',
  'Team',
  'Card',
  'CardSection',
  'CardAction',
  'PaymentLink',
  'NfcTag',
  'PipelineStage',
  'Lead',
  'Task',
  'Asset',
  'ScoringRule',
  'Subscription',
  'IntegrationConnection',
  'WebhookEndpoint',
  'ApiKey',
  'Automation',
  'IntegrationOAuthApp',
]);

/**
 * Tenant-scoped models (they carry an orgId column) — orgId is auto-injected
 * from the request context. Organization and User are excluded (the former is
 * the tenant itself, the latter spans organizations). Child models
 * (CardSection/CardAction/LeadActivity) are isolated through their parents.
 */
export const TENANT_MODELS = new Set<string>([
  'Membership',
  'Team',
  'Card',
  'NfcTag',
  'PipelineStage',
  'Lead',
  'Task',
  'Asset',
  'ScoringRule',
  'Event',
  'Subscription',
  'AuditLog',
  'IntegrationConnection',
  'WebhookEndpoint',
  'WebhookDelivery',
  'ApiKey',
  'Automation',
  'AutomationRun',
  'IntegrationOAuthApp',
  'CrmSyncRecord',
]);

/** Operations that take a where clause; orgId is injected (extendedWhereUnique is on in Prisma 6). */
export const WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

/** Read operations that automatically exclude soft-deleted records. */
export const SD_READ_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** The platform-admin sentinel: the only context allowed to cross organizations. */
export const ADMIN_ORG = 'admin';

export interface ScopeArgs {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
}

/**
 * Rewrites query args in place-safe fashion (returns a new args object) to
 * enforce tenant isolation and soft delete. Injection is forced: a caller's own
 * orgId in `where` cannot widen the scope, because ours is spread last.
 */
export function applyScope(
  model: string,
  operation: string,
  args: ScopeArgs,
  tenant: TenantContext | undefined,
): ScopeArgs {
  const a: ScopeArgs = { ...args };

  // (1) Tenant isolation: auto-inject orgId (forced — cannot be overridden).
  if (TENANT_MODELS.has(model) && tenant?.orgId && tenant.orgId !== ADMIN_ORG) {
    if (WHERE_OPS.has(operation)) {
      a.where = { ...(a.where ?? {}), orgId: tenant.orgId };
    } else if (operation === 'create') {
      a.data = {
        ...((a.data as Record<string, unknown>) ?? {}),
        orgId: tenant.orgId,
      };
    } else if (operation === 'createMany') {
      const rows = (Array.isArray(a.data) ? a.data : [a.data]) as Array<
        Record<string, unknown>
      >;
      a.data = rows.map((r) => ({ ...r, orgId: tenant.orgId }));
    } else if (operation === 'upsert') {
      a.where = { ...(a.where ?? {}), orgId: tenant.orgId };
      a.create = { ...(a.create ?? {}), orgId: tenant.orgId };
    }
  }

  // (2) Soft delete: exclude deletedAt on reads (injected orgId is preserved).
  if (SOFT_DELETE_MODELS.has(model) && SD_READ_OPS.has(operation)) {
    a.where = { deletedAt: null, ...(a.where ?? {}) };
  }

  return a;
}
