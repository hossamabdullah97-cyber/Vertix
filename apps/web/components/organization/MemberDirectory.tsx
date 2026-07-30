'use client';

import { useState, useMemo } from 'react';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import type { Role, Member, Team } from '@/lib/client';
import { Badge, Card } from '@/design-system';

interface MemberDirectoryProps {
  members: Member[];
  teams: Team[];
  me: any;
  /**
   * True when the workspace is on a paid plan. The badge belongs to the
   * organization, so every member of a paid workspace carries it.
   */
  verified?: boolean;
  onInvite: (email: string, name: string, role: Role, teamId: string) => void;
  onUpdateRole: (id: string, role: Role) => void;
  onUpdateTeam: (id: string, teamId: string | null) => void;
  onUpdateStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED') => void;
  onRemove: (id: string) => void;
}

const STATUS_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  ACTIVE: { label: 'Active', cls: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/15', dot: '#10b981' },
  SUSPENDED: { label: 'Suspended', cls: 'text-rose-500 bg-rose-500/10 border-rose-500/15', dot: '#f43f5e' },
  INVITED: { label: 'Invited', cls: 'text-amber-500 bg-amber-500/10 border-amber-500/15', dot: '#f59e0b' },
};

export function MemberDirectory({
  members,
  teams,
  me,
  verified = false,
  onInvite,
  onUpdateRole,
  onUpdateTeam,
  onUpdateStatus,
  onRemove,
}: MemberDirectoryProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('EMPLOYEE');
  const [teamId, setTeamId] = useState('');

  // Filtering States
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterTeam, setFilterTeam] = useState('ALL');

  const canManage = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const ROLES: Role[] = ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE'];

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onInvite(email, name, role, teamId);
    setEmail('');
    setName('');
  };

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        (m.user?.name ?? '').toLowerCase().includes(q) ||
        m.user?.email.toLowerCase().includes(q);
      const matchRole = filterRole === 'ALL' || m.role === filterRole;
      const matchStatus = filterStatus === 'ALL' || m.status === filterStatus;
      const matchTeam = filterTeam === 'ALL' || m.teamId === filterTeam;

      return matchSearch && matchRole && matchStatus && matchTeam;
    });
  }, [members, search, filterRole, filterStatus, filterTeam]);

  return (
    <div className="space-y-6 text-left">
      {/* Invite form */}
      {canManage && (
        <form onSubmit={handleInviteSubmit} className="v-card p-5 bg-surface border border-line rounded-2xl shadow-sm">
          <h3 className="text-[14.5px] font-black text-ink tracking-tight mb-1">Invite Employee Member</h3>
          <p className="text-[11.5px] text-muted mb-4 font-semibold">Add a new user and assign roles and departments</p>
          
          <div className="grid sm:grid-cols-[1.2fr_1.2fr_1fr_1fr_auto] gap-3.5 items-end">
            <label className="block space-y-1">
              <span className="text-[9.5px] font-bold text-muted uppercase tracking-wider">Email Address</span>
              <input
                className="v-field !h-9 text-[12px] font-semibold"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[9.5px] font-bold text-muted uppercase tracking-wider">Full Name</span>
              <input
                className="v-field !h-9 text-[12px] font-semibold"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[9.5px] font-bold text-muted uppercase tracking-wider">Workspace Role</span>
              <select
                className="v-field !h-9 text-[12px] font-bold bg-canvas"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[9.5px] font-bold text-muted uppercase tracking-wider">Department / Team</span>
              <select
                className="v-field !h-9 text-[12px] font-bold bg-canvas"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">No Team Assigned</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <button className="v-btn !h-9 px-6 font-black w-full sm:w-auto">Send Invite</button>
          </div>
        </form>
      )}

      {/* Directory Controls and Filters */}
      <div className="v-card p-5 bg-surface border border-line rounded-2xl shadow-sm space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-line/60 pb-3">
          <div>
            <h3 className="text-[14.5px] font-black text-ink tracking-tight">Active Employee Registry</h3>
            <p className="text-[11.5px] text-muted font-semibold">Provision roles, update team segments, or revoke permissions</p>
          </div>

          <button
            onClick={() => {
              const csvContent = "data:text/csv;charset=utf-8,Name,Email,Role,Team,Status\n" +
                members.map(m => `${m.user.name || 'Pending'},${m.user.email},${m.role},${m.team?.name || 'None'},${m.status}`).join('\n');
              const link = document.createElement("a");
              link.setAttribute("href", encodeURI(csvContent));
              link.setAttribute("download", "employee_directory.csv");
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            className="v-btn v-btn-ghost !h-9 text-[11.5px] font-bold flex items-center gap-1.5 shrink-0"
          >
            <Icon name="check" size={13} /> Export Directory
          </button>
        </div>

        {/* Smart Filters row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 text-xs font-semibold">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-line rounded-xl bg-canvas text-xs focus:outline-none focus:border-accent"
            />
            <span className="absolute left-2.5 top-2.5 text-muted">
              <Icon name="search" size={13} />
            </span>
          </div>

          <select
            className="w-full py-1.5 px-2.5 border border-line rounded-xl bg-canvas focus:outline-none text-xs font-bold"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="ALL">All Roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>

          <select
            className="w-full py-1.5 px-2.5 border border-line rounded-xl bg-canvas focus:outline-none text-xs font-bold"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INVITED">Invited</option>
            <option value="SUSPENDED">Suspended</option>
          </select>

          <select
            className="w-full py-1.5 px-2.5 border border-line rounded-xl bg-canvas focus:outline-none text-xs font-bold"
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
          >
            <option value="ALL">All Teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {/* Member Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
          {filteredMembers.map((m) => {
            const statusInfo = STATUS_STYLE[m.status] ?? STATUS_STYLE.ACTIVE;
            return (
              <Card key={m.id} variant="standard" className="p-4.5 space-y-4 hover:shadow-md transition-all relative border border-line">
                {/* Header: avatar + name/email */}
                <div className="flex gap-3 items-start min-w-0">
                  <Avatar user={m.user} size={36} verified={verified} />
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-ink text-xs truncate leading-tight">{m.user?.name || 'Pending Invite'}</p>
                    <p className="text-[10px] text-muted font-mono truncate mt-0.5">{m.user?.email}</p>
                  </div>
                  <Badge variant={statusInfo.label === 'Suspended' ? 'error' : statusInfo.label === 'Active' ? 'success' : 'neutral'} className="text-[8px] font-black uppercase shrink-0">
                    {statusInfo.label}
                  </Badge>
                </div>

                {/* Body details: role, team, performance */}
                <div className="space-y-2 border-t border-line/60 pt-3 text-[11px] font-semibold text-muted">
                  <div className="flex justify-between items-center">
                    <span>Role Selection</span>
                    {canManage ? (
                      <select
                        className="bg-transparent border border-line rounded-lg px-2 py-0.5 text-[10px] font-bold text-ink focus:outline-none"
                        value={m.role}
                        onChange={(e) => onUpdateRole(m.id, e.target.value as Role)}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : (
                      <Badge variant="neutral" className="!text-[9px] uppercase font-black">{m.role}</Badge>
                    )}
                  </div>

                  <div className="flex justify-between items-center">
                    <span>Assigned Team</span>
                    {canManage ? (
                      <select
                        className="bg-transparent border border-line rounded-lg px-2 py-0.5 text-[10px] font-bold text-ink focus:outline-none max-w-[130px]"
                        value={m.teamId ?? ''}
                        onChange={(e) => onUpdateTeam(m.id, e.target.value || null)}
                      >
                        <option value="">No Team</option>
                        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-ink font-bold">{m.team?.name || 'None'}</span>
                    )}
                  </div>

                </div>

                {/* Footer buttons: Suspend / reactivate / remove */}
                {canManage && (
                  <div className="flex gap-2 pt-2 border-t border-line/60">
                    {m.user?.id !== me?.sub && m.role !== 'OWNER' && (
                      <button
                        onClick={() => onUpdateStatus(m.id, m.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED')}
                        className={`flex-1 py-1 rounded-lg border text-[10.5px] font-black transition-all ${
                          m.status === 'SUSPENDED'
                            ? 'text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/5'
                            : 'text-amber-500 border-amber-500/20 hover:bg-amber-500/5'
                        }`}
                      >
                        {m.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                      </button>
                    )}
                    {m.user?.id !== me?.sub && (
                      <button
                        onClick={() => onRemove(m.id)}
                        className="py-1 px-2.5 rounded-lg border border-red-500/20 hover:border-red-500 text-rose-500 hover:bg-red-500/5 text-[10.5px] font-black transition-all"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
          {filteredMembers.length === 0 && (
            <div className="col-span-full text-center py-10 text-muted font-bold text-xs">
              No registry members matched current filters
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
