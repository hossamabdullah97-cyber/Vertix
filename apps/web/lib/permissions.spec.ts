import { describe, expect, it } from 'vitest';
import { canOpen } from './permissions';

const owner = { role: 'OWNER' as const, customRole: null };
const manager = { role: 'MANAGER' as const, customRole: null };
const member = { role: 'EMPLOYEE' as const, customRole: null };
const billingOnly = { role: 'EMPLOYEE' as const, customRole: { id: 'r', name: 'Billing', capabilities: ['billing:full'] } };

describe('canOpen', () => {
  it('opens everything to an owner', () => {
    for (const p of ['/team', '/workspace', '/workspace/teams/x', '/integrations', '/billing', '/analytics/events/x']) expect(canOpen(owner, p)).toBe(true);
  });

  it('keeps a member to their own work', () => {
    for (const p of ['/dashboard', '/cards', '/cards/x', '/leads', '/tags', '/analytics', '/meet', '/account', '/notifications', '/help']) expect(canOpen(member, p)).toBe(true);
    for (const p of ['/team', '/team?view=roles', '/workspace', '/workspace/teams/x', '/integrations', '/billing', '/billing/invoices/x', '/analytics/events/x']) expect(canOpen(member, p)).toBe(false);
  });

  it('lets a manager see the team and settings, not billing', () => {
    expect(canOpen(manager, '/team')).toBe(true);
    expect(canOpen(manager, '/workspace/departments/x')).toBe(true);
    expect(canOpen(manager, '/integrations')).toBe(true);
    expect(canOpen(manager, '/billing')).toBe(false);
  });

  it('follows a custom role’s parts', () => {
    expect(canOpen(billingOnly, '/billing')).toBe(true);
    expect(canOpen(billingOnly, '/team')).toBe(false);
  });

  it('matches whole path segments only', () => {
    expect(canOpen(member, '/teams-of-the-world')).toBe(true);
  });
});
