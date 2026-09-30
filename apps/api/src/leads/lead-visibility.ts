import type { Prisma, TenantContext } from '@vertex/db';

/**
 * The leads a person may see inside their org (the org itself is applied by
 * the tenant extension). A member works on their own leads only: the ones
 * assigned to them and the ones their cards brought in. Managers and above
 * see every lead.
 */
export function leadsVisibleTo(viewer: TenantContext): Prisma.LeadWhereInput {
  return viewer.role === 'EMPLOYEE'
    ? { OR: [{ assignedTo: viewer.userId }, { card: { ownerId: viewer.userId } }] }
    : {};
}

/** Tasks follow their lead; a member also sees the tasks given to them. */
export function tasksVisibleTo(viewer: TenantContext): Prisma.TaskWhereInput {
  return viewer.role === 'EMPLOYEE'
    ? { OR: [{ assignedTo: viewer.userId }, { lead: leadsVisibleTo(viewer) }] }
    : {};
}
