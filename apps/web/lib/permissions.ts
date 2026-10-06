import { capabilitiesOf, hasCapability, type PermissionArea, type PermissionLevel } from '@vertex/shared';
import type { Me } from '@/lib/client';

/**
 * What the person can do in the workspace open now, by the same rule as the
 * API: a custom role's levels, or the built-in role's. The API refuses the
 * rest anyway; this only decides what the pages offer.
 */
export function can(me: Pick<Me, 'role' | 'customRole'> | null | undefined, area: PermissionArea, level: PermissionLevel = 'basic'): boolean {
  if (!me?.role) return false;
  return hasCapability(capabilitiesOf(me.role, me.customRole), area, level);
}

/** Changing who holds which role: a built-in owner or admin only, never through a custom role. */
export const canChangeRoles = (me: Pick<Me, 'role' | 'customRole'> | null | undefined) => !!me && (me.role === 'OWNER' || me.role === 'ADMIN') && !me.customRole;
