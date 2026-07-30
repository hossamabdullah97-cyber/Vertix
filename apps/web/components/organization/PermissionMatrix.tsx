'use client';

import { Fragment } from 'react';
import { Icon } from '@/components/Icon';

const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE'] as const;
type RoleName = (typeof ROLES)[number];

/**
 * Read-only capability matrix that reflects the ACTUAL RBAC enforced by the
 * backend `@Roles(...)` guards — not editable toggles. Custom/configurable
 * roles are a future addition; today the four platform roles are fixed.
 */
const GROUPS: { title: string; perms: { label: string; desc: string; allow: RoleName[] }[] }[] = [
  {
    title: 'People',
    perms: [
      { label: 'View members', desc: 'See the org member directory', allow: ['OWNER', 'ADMIN', 'MANAGER'] },
      { label: 'Invite members', desc: 'Send workspace invitations', allow: ['OWNER', 'ADMIN'] },
      { label: 'Manage roles & status', desc: 'Change roles, suspend / reactivate', allow: ['OWNER', 'ADMIN'] },
      { label: 'Remove members', desc: 'Revoke workspace access', allow: ['OWNER', 'ADMIN'] },
    ],
  },
  {
    title: 'Teams',
    perms: [
      { label: 'View teams', desc: 'See departments & teams', allow: ['OWNER', 'ADMIN', 'MANAGER'] },
      { label: 'Manage teams', desc: 'Create, rename, delete teams', allow: ['OWNER', 'ADMIN'] },
    ],
  },
  {
    title: 'Workspace',
    perms: [
      { label: 'Manage NFC hardware', desc: 'Assign & provision NFC tags', allow: ['OWNER', 'ADMIN', 'MANAGER'] },
      { label: 'Manage branding', desc: 'Logo, colors, defaults', allow: ['OWNER', 'ADMIN'] },
      { label: 'View audit logs', desc: 'Security & activity trail', allow: ['OWNER', 'ADMIN'] },
      { label: 'Manage billing', desc: 'Plans, invoices, seats', allow: ['OWNER', 'ADMIN'] },
      { label: 'Transfer ownership / delete org', desc: 'Owner-only destructive actions', allow: ['OWNER'] },
    ],
  },
  {
    title: 'Personal',
    perms: [
      { label: 'Manage own cards', desc: 'Create & edit your digital cards', allow: ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE'] },
      { label: 'Manage own CRM leads', desc: 'Work your assigned pipeline', allow: ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE'] },
    ],
  },
];

const ROLE_TINT: Record<RoleName, string> = { OWNER: '#2563eb', ADMIN: '#0ea5e9', MANAGER: '#10b981', EMPLOYEE: '#94a3b8' };

export function PermissionMatrix({ me }: { me?: { role?: string } | null }) {
  const myRole = me?.role as RoleName | undefined;

  return (
    <div className="v-card p-5 bg-surface border border-line rounded-2xl shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[14.5px] font-bold text-ink tracking-tight">Role Permissions</h3>
          <p className="text-[11.5px] text-muted">What each workspace role can do — enforced by the platform&rsquo;s RBAC.</p>
        </div>
        {myRole && (
          <span className="v-chip !px-2.5 !py-1 !text-[10.5px] font-bold" style={{ color: ROLE_TINT[myRole], background: `${ROLE_TINT[myRole]}1a`, borderColor: `${ROLE_TINT[myRole]}33` }}>
            Your role: {myRole}
          </span>
        )}
      </div>

      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full border-collapse text-left min-w-[620px]">
          <thead>
            <tr>
              <th className="py-2.5 pe-4 text-[11px] font-bold uppercase tracking-wider text-muted">Permission</th>
              {ROLES.map((r) => (
                <th
                  key={r}
                  className="py-2.5 px-2 text-center text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: r === myRole ? ROLE_TINT[r] : 'hsl(var(--v-muted))' }}
                >
                  <span className="inline-flex items-center gap-1.5 justify-center">
                    <span className="h-2 w-2 rounded-full" style={{ background: ROLE_TINT[r] }} />
                    {r}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => (
              <Fragment key={g.title}>
                <tr>
                  <td colSpan={5} className="pt-4 pb-1.5 text-[10.5px] font-black uppercase tracking-[0.12em] text-faint">{g.title}</td>
                </tr>
                {g.perms.map((p) => (
                  <tr key={p.label} className="border-t border-line/60">
                    <td className="py-2.5 pe-4">
                      <span className="block text-[12.5px] font-bold text-ink">{p.label}</span>
                      <span className="block text-[10.5px] text-muted">{p.desc}</span>
                    </td>
                    {ROLES.map((r) => {
                      const allowed = p.allow.includes(r);
                      const highlight = r === myRole;
                      return (
                        <td key={r} className="px-2 text-center" style={highlight ? { background: `${ROLE_TINT[r]}0d` } : undefined}>
                          {allowed ? (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ background: ROLE_TINT[r] }}>
                              <Icon name="check" size={12} />
                            </span>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted flex items-center gap-1.5 pt-1">
        <Icon name="lock" size={12} className="text-faint" />
        These roles are platform-defined and enforced server-side. Custom roles &amp; granular per-permission overrides are on the roadmap.
      </p>
    </div>
  );
}
