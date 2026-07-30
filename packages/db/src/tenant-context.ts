import { AsyncLocalStorage } from 'node:async_hooks';

/** Active tenant context for the current request — auto-injected into Prisma queries. */
export interface TenantContext {
  orgId: string;
  userId: string;
  role: string;
}

/**
 * Context store backed by AsyncLocalStorage — holds the active organization
 * for the lifetime of the request. Read by the Prisma extension to inject
 * orgId into every query against tenant-scoped tables.
 */
export const tenantStore = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext | undefined {
  return tenantStore.getStore();
}

export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return tenantStore.run(ctx, fn);
}
