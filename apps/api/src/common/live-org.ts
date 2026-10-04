/**
 * A card, chip or form of a deleted workspace stays in the database until it
 * is erased (OrgPurgeService), but leaves the public side at once: no card
 * page, no chip redirect, no lead capture, no visit counted. Every public
 * lookup adds this to its where clause.
 */
export const LIVE_ORG = { org: { deletedAt: null } } as const;
