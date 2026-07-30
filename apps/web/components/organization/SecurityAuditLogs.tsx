'use client';

import { Icon } from '@/components/Icon';
import { relativeTime } from '@/lib/crm';

export interface AuditEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { name: string | null; email: string } | null;
}

const ACTION_META: Record<string, { label: string; color: string }> = {
  'member.invited': { label: 'Member invited', color: '#f59e0b' },
  'member.added': { label: 'Member added', color: '#10b981' },
  'member.role_changed': { label: 'Role updated', color: '#2563eb' },
  'member.team_changed': { label: 'Team reassigned', color: '#0ea5e9' },
  'member.suspended': { label: 'Member suspended', color: '#f43f5e' },
  'member.reactivated': { label: 'Member reactivated', color: '#10b981' },
  'member.removed': { label: 'Member removed', color: '#ef4444' },
  'team.created': { label: 'Team created', color: '#3b82f6' },
  'team.deleted': { label: 'Team deleted', color: '#ef4444' },
};

export function auditActionMeta(action: string) {
  return ACTION_META[action] ?? { label: action.replace(/[._]/g, ' '), color: '#94a3b8' };
}
const actionMeta = auditActionMeta;

/** Human-readable target from the log metadata (falls back to type/id). */
function targetLabel(log: AuditEntry): string {
  const m = log.metadata ?? {};
  return (
    (m.email as string) ||
    (m.name as string) ||
    (log.targetType ? `${log.targetType}${log.targetId ? ` · ${log.targetId.slice(0, 8)}` : ''}` : '—')
  );
}

/** Real, immutable audit trail for the active organization. */
export function SecurityAuditLogs({ logs }: { logs: AuditEntry[] }) {
  return (
    <div className="v-card p-5 bg-surface border border-line rounded-2xl shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-[14.5px] font-bold text-ink tracking-tight">Security Auditing Logs</h3>
          <p className="text-[11.5px] text-muted">Immutable record of administrative actions in this workspace</p>
        </div>
        <span className="v-chip !px-2.5 !py-1 !text-[10.5px] font-bold text-muted">{logs.length} events</span>
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-faint">
          <Icon name="lock" size={26} />
          <p className="text-[13px] font-semibold text-muted">No audit events yet</p>
          <p className="text-[11.5px] max-w-xs">Administrative actions — invites, role changes, suspensions, team edits — are recorded here automatically.</p>
        </div>
      ) : (
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left text-[12.5px] border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-line text-muted font-bold">
                <th className="py-2.5">Action</th>
                <th className="py-2.5">Actor</th>
                <th className="py-2.5">Target</th>
                <th className="py-2.5">Occurred</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const meta = actionMeta(log.action);
                return (
                  <tr key={log.id} className="border-b border-line/60 last:border-0 hover:bg-canvas/20">
                    <td className="py-3">
                      <span className="font-bold text-ink flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="text-ink block font-semibold">{log.actor?.name || log.actor?.email || 'System'}</span>
                      {log.actor?.name && <span className="text-[10.5px] text-faint">{log.actor.email}</span>}
                    </td>
                    <td className="py-3 text-muted">{targetLabel(log)}</td>
                    <td className="py-3 text-muted font-semibold whitespace-nowrap">{relativeTime(log.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
