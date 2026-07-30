import { PrismaClient, Prisma } from '@prisma/client';
import { getTenantContext } from './tenant-context';
import { applyScope, type ScopeArgs } from './scope';

function createPrismaClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

  return base.$extends({
    query: {
      $allModels: {
        async $allOperations(rawParams) {
          // Explicit cast to avoid Prisma's complex type-inference collapse.
          const { model, operation, args, query } = rawParams as unknown as {
            model?: string;
            operation: string;
            args: {
              where?: Record<string, unknown>;
              data?: unknown;
              create?: Record<string, unknown>;
            };
            query: (a: unknown) => Promise<unknown>;
          };
          if (!model) return query(args);
          const a = applyScope(model, operation, (args ?? {}) as ScopeArgs, getTenantContext());

          return query(a);
        },
      },
    },
    model: {
      $allModels: {
        async softDelete<T>(this: T, where: unknown) {
          const ctx = Prisma.getExtensionContext(this) as unknown as {
            update: (a: unknown) => Promise<unknown>;
          };
          return ctx.update({ where, data: { deletedAt: new Date() } });
        },
        async softDeleteMany<T>(this: T, where: unknown) {
          const ctx = Prisma.getExtensionContext(this) as unknown as {
            updateMany: (a: unknown) => Promise<unknown>;
          };
          return ctx.updateMany({ where, data: { deletedAt: new Date() } });
        },
      },
    },
  });
}

export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

// Singleton — prevents creating multiple clients during dev hot-reload.
const globalForPrisma = globalThis as unknown as {
  prisma?: ExtendedPrismaClient;
};

export const prisma: ExtendedPrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export {
  tenantStore,
  getTenantContext,
  runWithTenant,
  type TenantContext,
} from './tenant-context';
export { ADMIN_ORG, applyScope, TENANT_MODELS, SOFT_DELETE_MODELS } from './scope';
export { Prisma } from '@prisma/client';
export * from '@prisma/client';
