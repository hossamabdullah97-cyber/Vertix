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

type Who = Pick<Me, 'role' | 'customRole'> | null | undefined;

/**
 * Which pages a person can open in the workspace open now. A page they cannot
 * use is left out of the menus, and opened by a link it says so instead of
 * loading (see components/AccessGate). Anything not listed is for everyone.
 * The most specific prefix wins.
 */
const PAGES: { prefix: string; allow: (me: Who) => boolean }[] = [
  { prefix: '/team', allow: (me) => can(me, 'people') || can(me, 'teams') },
  { prefix: '/workspace/teams', allow: (me) => can(me, 'teams') },
  { prefix: '/workspace/departments', allow: (me) => can(me, 'teams') },
  { prefix: '/workspace', allow: (me) => can(me, 'workspace') || canChangeRoles(me) },
  { prefix: '/integrations', allow: (me) => can(me, 'integrations') },
  { prefix: '/billing', allow: (me) => can(me, 'billing', 'full') },
  { prefix: '/analytics/events', allow: (me) => can(me, 'analytics') },
];

export function canOpen(me: Who, path: string): boolean {
  const pathname = path.split(/[?#]/)[0]!;
  const rule = PAGES.filter((p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return rule ? rule.allow(me) : true;
}
