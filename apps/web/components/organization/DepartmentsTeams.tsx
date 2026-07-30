'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { authFetch } from '@/lib/client';
import type { Team, Member } from '@/lib/client';
import { Badge, Button } from '@/design-system';

interface DepartmentsTeamsProps {
  teams: Team[];
  members: Member[];
  me: any;
  onCreateTeam: (name: string) => void;
  onDeleteTeam: (id: string) => void;
  onUpdateTeamManager: (id: string, managerId: string | null) => void;
  onOpenTeam?: (id: string) => void;
  onOpenDepartment?: (id: string) => void;
}

export function DepartmentsTeams({
  teams,
  members,
  me,
  onCreateTeam,
  onDeleteTeam,
  onUpdateTeamManager,
}: DepartmentsTeamsProps) {
  const [newTeamName, setNewTeamName] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Bulk Member Assignment Modal States
  const [modalTeamId, setModalTeamId] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [modalSearch, setModalSearch] = useState('');
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [isSavingMembers, setIsSavingMembers] = useState(false);
  const [modalFocusIdx, setModalFocusIdx] = useState(0);

  const canManage = me?.role === 'OWNER' || me?.role === 'ADMIN';

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newTeamName.trim();
    if (!name) return;
    onCreateTeam(name);
    setNewTeamName('');
  };

  // Open Bulk Assignment Modal
  const openAssignmentModal = (teamId: string) => {
    setModalTeamId(teamId);
    const currentTeamMemberIds = members.filter((m) => m.teamId === teamId).map((m) => m.id);
    setSelectedMembers(currentTeamMemberIds);
    setModalSearch('');
    setFilterRole('ALL');
    setFilterStatus('ALL');
    setActiveMenuId(null);
    setModalFocusIdx(0);
  };

  const handleMemberCheckboxToggle = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const saveMemberAssignments = async () => {
    if (!modalTeamId) return;
    setIsSavingMembers(true);
    try {
      const promises = members.map(async (m) => {
        const isSelected = selectedMembers.includes(m.id);
        const isInTeamAlready = m.teamId === modalTeamId;

        if (isSelected && !isInTeamAlready) {
          return authFetch(`/orgs/members/${m.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ teamId: modalTeamId }),
          });
        } else if (!isSelected && isInTeamAlready) {
          return authFetch(`/orgs/members/${m.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ teamId: null }),
          });
        }
      });
      await Promise.all(promises);
      setModalTeamId(null);
      window.location.reload();
    } catch {
    } finally {
      setIsSavingMembers(false);
    }
  };

  // Keyboard navigation for Modal
  const handleModalKeyDown = (e: React.KeyboardEvent, filteredMembers: Member[]) => {
    if (filteredMembers.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setModalFocusIdx((prev) => (prev + 1) % filteredMembers.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setModalFocusIdx((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
    } else if (e.key === ' ') {
      e.preventDefault();
      if (filteredMembers[modalFocusIdx]) {
        handleMemberCheckboxToggle(filteredMembers[modalFocusIdx].id);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      saveMemberAssignments();
    }
  };

  // Context Menu Actions
  const handleRenameTeam = async (id: string, currentName: string) => {
    setActiveMenuId(null);
    const newName = window.prompt('Rename Workgroup name:', currentName);
    if (!newName || !newName.trim()) return;
    try {
      await authFetch(`/orgs/teams/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: newName.trim() }),
      });
      window.location.reload();
    } catch {}
  };

  const handleDuplicateTeam = async (team: Team) => {
    setActiveMenuId(null);
    try {
      await authFetch(`/orgs/teams`, {
        method: 'POST',
        body: JSON.stringify({ name: `${team.name} (Copy)`, departmentId: (team as any).departmentId }),
      });
      window.location.reload();
    } catch {}
  };

  const handleArchiveTeam = async (id: string) => {
    setActiveMenuId(null);
    if (!window.confirm('Are you sure you want to archive this team?')) return;
    try {
      await authFetch(`/orgs/teams/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ metadata: { archived: true } }),
      });
      window.location.reload();
    } catch {}
  };

  const handleTransferTeam = async (id: string) => {
    setActiveMenuId(null);
    const targetDeptId = window.prompt('Enter target Department ID to transfer:');
    if (!targetDeptId) return;
    try {
      await authFetch(`/orgs/teams/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ departmentId: targetDeptId }),
      });
      window.location.reload();
    } catch {}
  };

  return (
    <div className="space-y-8">
      {/* Teams Section */}
      <div>
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className="v-icon-tile"><Icon name="users" size={16} /></span>
            <div>
              <h3 className="text-[15px] font-extrabold text-ink tracking-tight">Teams</h3>
              <p className="text-[11.5px] text-muted font-medium">Create teams, assign managers, and allocate members</p>
            </div>
          </div>
          {canManage && (
            <form onSubmit={handleCreateSubmit} className="flex items-center gap-2 bg-canvas border border-line p-1.5 rounded-xl shrink-0">
              <input
                className="v-field !bg-surface !h-8 text-xs font-semibold pl-3 w-[150px] sm:w-[200px]"
                placeholder="Team Name (e.g. Growth Marketing)"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                required
              />
              <button className="v-btn h-8 px-4 text-xs font-bold shrink-0">Add Team</button>
            </form>
          )}
        </div>

        {teams.length === 0 ? (
          <div className="text-center py-16 bg-surface border border-line border-dashed rounded-2xl">
            <Icon name="grid" size={24} className="text-faint" />
            <p className="text-sm font-semibold text-muted mt-2">No active workgroups found. Create one above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((t) => {
              const teamColor = (t as any).color ?? '#2563eb';
              const teamMembers = members.filter((m) => m.teamId === t.id);

              // Available managers list
              const availableManagers = members.filter((m) => m.role !== 'EMPLOYEE');

              return (
                <div
                  key={t.id}
                  className="bg-surface border border-line rounded-2xl p-5 shadow-sm relative flex flex-col justify-between h-[270px] hover:shadow-md hover:border-line-strong transition-all group"
                  style={{ borderLeft: `4px solid ${teamColor}` }}
                >
                  {/* Context Menu dots */}
                  {canManage && (
                    <div className="absolute top-4.5 right-4.5 z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === t.id ? null : t.id);
                        }}
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-muted hover:bg-canvas hover:text-ink transition-colors"
                      >
                        <Icon name="dots" size={15} />
                      </button>
                      
                      {activeMenuId === t.id && (
                        <div className="absolute right-0 top-8 bg-surface border border-line rounded-xl shadow-xl p-1.5 space-y-1 w-[190px] z-20">
                          <Link
                            href={`/workspace/teams/${t.id}`}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-canvas text-ink flex items-center gap-1.5"
                          >
                            <Icon name="gauge" size={12} /> View Details
                          </Link>
                          <button
                            onClick={() => handleRenameTeam(t.id, t.name)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-canvas text-ink flex items-center gap-1.5"
                          >
                            <Icon name="settings" size={12} /> Rename Team
                          </button>
                          <button
                            onClick={() => handleDuplicateTeam(t)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-canvas text-ink flex items-center gap-1.5"
                          >
                            <Icon name="copy" size={12} /> Duplicate Team
                          </button>
                          <button
                            onClick={() => handleArchiveTeam(t.id)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-canvas text-ink flex items-center gap-1.5"
                          >
                            <Icon name="clock" size={12} /> Archive Team
                          </button>
                          <button
                            onClick={() => handleTransferTeam(t.id)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-canvas text-ink flex items-center gap-1.5"
                          >
                            <Icon name="logout" size={12} /> Transfer Dept
                          </button>
                          <button
                            onClick={() => openAssignmentModal(t.id)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-canvas text-ink flex items-center gap-1.5"
                          >
                            <Icon name="users" size={12} /> Manage Members
                          </button>
                          <button
                            onClick={() => {
                              onDeleteTeam(t.id);
                              setActiveMenuId(null);
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-500/5 text-rose-500 flex items-center gap-1.5 border-t border-line/60 pt-1.5"
                          >
                            <Icon name="trash" size={12} /> Delete Team
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Card Main Info */}
                  <div className="min-w-0 pl-1">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-2 pr-6">
                      <h4 className="font-extrabold text-[14.5px] text-ink hover:text-accent cursor-pointer truncate">
                        <Link href={`/workspace/teams/${t.id}`}>{t.name}</Link>
                      </h4>
                    </div>

                    {/* Manager selector */}
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      <span className="font-semibold">Manager:</span>
                      {canManage ? (
                        <select
                          className="bg-transparent text-ink font-bold border-b border-transparent hover:border-line focus:outline-none text-[11.5px]"
                          value={t.managerId ?? ''}
                          onChange={(e) => onUpdateTeamManager(t.id, e.target.value || null)}
                        >
                          <option value="">No Manager</option>
                          {availableManagers.map((m) => (
                            <option key={m.id} value={m.user.id}>{m.user.name || m.user.email}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-bold text-ink truncate max-w-[120px]">
                          {t.manager?.name || t.manager?.email || 'Unassigned'}
                        </span>
                      )}
                    </div>

                    {/* Real summary metrics */}
                    <div className="mt-3.5 flex items-center gap-4 text-[11px] font-bold text-muted border-b border-line/60 pb-3">
                      <div>
                        <p className="text-[9px] font-black uppercase text-faint">Seats</p>
                        <p className="text-ink mt-0.5 tabular-nums">{teamMembers.length}</p>
                      </div>
                      <div className="h-6 w-px bg-line/60" />
                      <div>
                        <p className="text-[9px] font-black uppercase text-faint">Manager</p>
                        <p className="text-ink mt-0.5 truncate max-w-[120px]">{t.manager?.name || t.manager?.email || 'Unassigned'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Overlapping member avatars list */}
                  <div className="flex items-center justify-between gap-4 mt-3 pl-1">
                    <div className="flex items-center -space-x-2.5 overflow-hidden">
                      {teamMembers.slice(0, 5).map((m) => (
                        <span key={m.id} title={`${m.user.name || m.user.email} (${m.role.toLowerCase()})`}>
                          <Avatar user={m.user} size={30} ring className="shadow-sm" />
                        </span>
                      ))}
                      {teamMembers.length > 5 && (
                        <span
                          className="inline-flex h-7.5 w-7.5 items-center justify-center rounded-full border-2 border-surface bg-canvas text-[9px] font-black text-muted shadow-sm"
                          style={{ borderColor: 'hsl(var(--v-surface))' }}
                        >
                          +{teamMembers.length - 5}
                        </span>
                      )}
                      {teamMembers.length === 0 && (
                        <span className="text-[10px] text-faint font-semibold">No members assigned</span>
                      )}
                    </div>

                    {canManage && (
                      <button
                        onClick={() => openAssignmentModal(t.id)}
                        className="px-2.5 py-1 rounded-lg border border-line hover:border-accent hover:bg-accent/5 text-[10px] font-black text-muted hover:text-accent transition-all shrink-0"
                      >
                        Assign Members
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Bulk Member Assignment Modal Overlay */}
      {modalTeamId && (() => {
        const filteredMembers = members.filter((m) => {
          const q = modalSearch.toLowerCase().trim();
          const matchSearch = (m.user?.name ?? '').toLowerCase().includes(q) || m.user?.email.toLowerCase().includes(q);
          const matchRole = filterRole === 'ALL' || m.role === filterRole;
          const matchStatus = filterStatus === 'ALL' || m.status === filterStatus;
          return matchSearch && matchRole && matchStatus;
        });

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onKeyDown={(e) => handleModalKeyDown(e, filteredMembers)}
          >
            <div className="bg-surface border border-line rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-left">
              <div>
                <h3 className="text-[15px] font-black text-ink">Manage Team Members</h3>
                <p className="text-[11.5px] text-muted font-medium mt-0.5">Bulk allocate organization users to the workgroup.</p>
              </div>

              {/* Smart Filters row */}
              <div className="flex gap-2 text-[10.5px] font-bold">
                <select
                  className="flex-1 py-1 border border-line rounded-lg bg-canvas focus:outline-none"
                  value={filterRole}
                  onChange={(e) => {
                    setFilterRole(e.target.value);
                    setModalFocusIdx(0);
                  }}
                >
                  <option value="ALL">All Roles</option>
                  <option value="OWNER">Owner</option>
                  <option value="ADMIN">Admin</option>
                  <option value="MANAGER">Manager</option>
                  <option value="EMPLOYEE">Employee</option>
                </select>
                <select
                  className="flex-1 py-1 border border-line rounded-lg bg-canvas focus:outline-none"
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value);
                    setModalFocusIdx(0);
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INVITED">Invited</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
              </div>

              {/* Search filter input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search members by name or email..."
                  value={modalSearch}
                  onChange={(e) => {
                    setModalSearch(e.target.value);
                    setModalFocusIdx(0);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 border border-line rounded-xl bg-canvas text-xs focus:outline-none focus:border-accent"
                  autoFocus
                />
                <span className="absolute left-2.5 top-2.5 text-muted">
                  <Icon name="search" size={13} />
                </span>
              </div>

              {/* Bulk operations bar */}
              <div className="flex justify-between items-center text-[10px] font-bold text-muted border-b border-line/60 pb-2">
                <span>{selectedMembers.length} selected</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMembers(filteredMembers.map((m) => m.id))}
                    className="hover:text-accent"
                  >
                    Select All
                  </button>
                  <span className="text-line">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedMembers([])}
                    className="hover:text-accent"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Checkbox list of members */}
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {filteredMembers.map((m, idx) => {
                  const isChecked = selectedMembers.includes(m.id);
                  const isHighlighted = idx === modalFocusIdx;
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center justify-between p-2.5 border rounded-xl cursor-pointer text-xs font-semibold transition-colors ${
                        isHighlighted
                          ? 'bg-canvas border-accent ring-1 ring-accent/20'
                          : 'bg-canvas/30 border-line hover:bg-canvas'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar user={m.user} size={24} />
                        <div>
                          <p className="font-bold text-ink">{m.user.name || 'Pending Invite'}</p>
                          <p className="text-[10px] text-muted font-medium mt-0.5">{m.user.email}</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleMemberCheckboxToggle(m.id)}
                        className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
                      />
                    </label>
                  );
                })}
                {filteredMembers.length === 0 && (
                  <p className="text-xs text-muted text-center py-6">No matching organization members</p>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex gap-2 justify-end pt-3 border-t border-line">
                <button
                  disabled={isSavingMembers}
                  onClick={() => setModalTeamId(null)}
                  className="px-4 py-2 border border-line rounded-xl bg-canvas hover:bg-elevated text-xs font-bold text-ink transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={isSavingMembers}
                  onClick={saveMemberAssignments}
                  className="px-4 py-2 bg-accent hover:bg-accent-strong text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg active:scale-95 transition-all"
                >
                  {isSavingMembers ? 'Saving...' : 'Save Assignments'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
