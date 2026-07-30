'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch, getToken } from '@/lib/client';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { AreaChart } from '@/components/charts/AreaChart';
import { Sparkline } from '@/components/charts/Sparkline';
import { Badge, Button, Card, Skeleton, Alert } from '@/design-system';

type TabId =
  | 'overview'
  | 'members'
  | 'cards'
  | 'crm'
  | 'analytics'
  | 'meetings'
  | 'tasks'
  | 'files'
  | 'qrnfc'
  | 'audit'
  | 'settings';

const getHealth = (score: number) => {
  if (score >= 80) return { label: 'Excellent', badge: 'success', dot: '🟢' };
  if (score >= 50) return { label: 'Good', badge: 'warning', dot: '🟡' };
  if (score >= 25) return { label: 'Needs Attention', badge: 'warning', dot: '🟠' };
  return { label: 'Critical', badge: 'error', dot: '🔴' };
};

export default function TeamPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [team, setTeam] = useState<any>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Shared entity lists
  const [allCards, setAllCards] = useState<any[]>([]);
  const [allLeads, setAllLeads] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [allLogs, setAllLogs] = useState<any[]>([]);
  const [allAssets, setAllAssets] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);

  // Settings edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editDeptId, setEditDeptId] = useState('');
  const [editManagerId, setEditManagerId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [teamData, depts, membersList, crds, lds, tsks, logs, asts, tgs] = await Promise.all([
        authFetch<any>(`/orgs/teams/${params.id}`),
        authFetch<any[]>('/orgs/departments').catch(() => []),
        authFetch<any[]>('/orgs/members').catch(() => []),
        authFetch<any[]>('/cards').catch(() => []),
        authFetch<any[]>('/leads').catch(() => []),
        authFetch<any[]>('/tasks').catch(() => []),
        authFetch<any[]>('/orgs/audit-logs').catch(() => []),
        authFetch<any[]>('/orgs/assets').catch(() => []),
        authFetch<any[]>('/nfc/tags').catch(() => []),
      ]);
      setTeam(teamData);
      setDepartments(depts);
      setOrgMembers(membersList);
      setAllCards(crds);
      setAllLeads(lds);
      setAllTasks(tsks);
      setAllLogs(logs);
      setAllAssets(asts);
      setAllTags(tgs);

      setEditName(teamData.name);
      setEditColor(teamData.color || '#2563eb');
      setEditDeptId(teamData.departmentId || '');
      setEditManagerId(teamData.managerId || '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [router, load]);

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authFetch(`/orgs/teams/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          color: editColor,
          departmentId: editDeptId || null,
          managerId: editManagerId || null,
        }),
      });
      setIsEditing(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    try {
      await authFetch(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this team? Members will be unassigned.')) return;
    try {
      await authFetch(`/orgs/teams/${params.id}`, { method: 'DELETE' });
      router.replace('/team');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Filtered computed lists for this team
  const memberUserIds = useMemo(() => {
    if (!team?.memberships) return [];
    return team.memberships.map((m: any) => m.userId);
  }, [team]);

  const teamCards = useMemo(() => {
    return allCards.filter((c) => memberUserIds.includes(c.ownerId));
  }, [allCards, memberUserIds]);

  const teamCardsIds = useMemo(() => {
    return teamCards.map((c) => c.id);
  }, [teamCards]);

  const teamLeads = useMemo(() => {
    return allLeads.filter((l) => l.ownerId && memberUserIds.includes(l.ownerId));
  }, [allLeads, memberUserIds]);

  const teamTasks = useMemo(() => {
    return allTasks.filter((t) => t.userId && memberUserIds.includes(t.userId));
  }, [allTasks, memberUserIds]);

  const teamLogs = useMemo(() => {
    return allLogs.filter((l) => l.targetType === 'TEAM' && l.targetId === params.id);
  }, [allLogs, params.id]);

  const teamAssets = useMemo(() => {
    return allAssets.filter((a) => memberUserIds.includes(a.ownerId));
  }, [allAssets, memberUserIds]);

  const teamTags = useMemo(() => {
    return allTags.filter((t) => t.cardId && teamCardsIds.includes(t.cardId));
  }, [allTags, teamCardsIds]);

  const upcomingMeetings = useMemo(() => {
    return teamLeads
      .filter((l) => l.intent === 'MEETING' && l.meetingAt)
      .sort((a, b) => new Date(a.meetingAt!).getTime() - new Date(b.meetingAt!).getTime());
  }, [teamLeads]);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'gauge' },
    { id: 'members', label: 'Members', icon: 'users' },
    { id: 'cards', label: 'Cards', icon: 'columns' },
    { id: 'crm', label: 'CRM', icon: 'inbox' },
    { id: 'analytics', label: 'Analytics', icon: 'chart-bar' },
    { id: 'meetings', label: 'Meetings', icon: 'calendar' },
    { id: 'tasks', label: 'Tasks', icon: 'check-circle' },
    { id: 'files', label: 'Files', icon: 'file-text' },
    { id: 'qrnfc', label: 'QR/NFC', icon: 'tag' },
    { id: 'audit', label: 'Audit', icon: 'clock' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ] as const;

  if (loading) {
    return (
      <AppShell title="Loading Team...">
        <div className="space-y-6">
          <Skeleton className="h-12 w-64 animate-pulse bg-line" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Skeleton className="h-28 rounded-2xl animate-pulse bg-line" />
            <Skeleton className="h-28 rounded-2xl animate-pulse bg-line" />
            <Skeleton className="h-28 rounded-2xl animate-pulse bg-line" />
          </div>
          <Skeleton className="h-64 rounded-2xl animate-pulse bg-line" />
        </div>
      </AppShell>
    );
  }

  if (error || !team) {
    return (
      <AppShell title="Error">
        <Alert variant="error" className="mb-6">
          {error || 'Team not found.'}
        </Alert>
        <Link href="/team" className="text-accent font-bold hover:underline">
          ← Back to Workspace Directory
        </Link>
      </AppShell>
    );
  }

  const teamColor = team.color || '#2563eb';
  const teamMembers = team.memberships || [];

  return (
    <AppShell title={`${team.name} Team`}>
      {/* Header Banner */}
      <div className="mb-6 bg-surface border border-line rounded-2xl p-6 shadow-sm flex items-center justify-between gap-4 flex-wrap relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full" style={{ background: teamColor }} />
        <div className="space-y-1.5 pl-2">
          <div className="flex items-center gap-2">
            <h2 className="v-display text-[18px] font-black text-ink">{team.name} Team</h2>
            <Badge variant="neutral" style={{ color: teamColor, background: `${teamColor}10`, borderColor: `${teamColor}20` }} className="text-[9px] uppercase font-black">
              {team.department?.name || 'No Department'}
            </Badge>
            <Badge variant="neutral" className="font-black !text-[8.5px] uppercase select-none">
              {teamMembers.length} {teamMembers.length === 1 ? 'seat' : 'seats'}
            </Badge>
          </div>
          <p className="text-xs text-muted font-semibold flex items-center gap-1.5">
            <span>Team Manager:</span>
            <span className="text-ink font-bold">{team.manager?.name || team.manager?.email || 'Unassigned'}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push('/team')} className="font-bold flex items-center gap-2">
            <Icon name="arrow" className="rotate-180" size={13} /> Directory
          </Button>
        </div>
      </div>

      {/* Tabs list */}
      <div className="mb-6 flex border-b border-line gap-2 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 -mb-px whitespace-nowrap ${
                active ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              <Icon name={tab.icon} size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className="space-y-6">
        {activeTab === 'overview' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              {/* Metrics cards row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <Card variant="standard" className="p-5 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase">Active Members</p>
                  <h3 className="text-2xl font-black text-ink mt-2">{teamMembers.length}</h3>
                </Card>
                <Card variant="standard" className="p-5 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase">Completed tasks</p>
                  <h3 className="text-2xl font-black text-emerald-500 mt-2">{teamTasks.filter((t) => t.completed).length}</h3>
                </Card>
                <Card variant="standard" className="p-5 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase">Total tasks</p>
                  <h3 className="text-2xl font-black text-blue-600 mt-2">{teamTasks.length}</h3>
                </Card>
              </div>

              {/* Dynamic activity summaries */}
              <Card variant="standard" className="p-6">
                <h3 className="text-[14.5px] font-black text-ink tracking-tight mb-4">Interactions & Scans</h3>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="bg-canvas/30 border border-line p-4 rounded-xl">
                    <p className="text-3xl font-black text-ink">{team.views ?? 0}</p>
                    <p className="text-[10px] text-muted font-bold uppercase mt-1">Profile views</p>
                  </div>
                  <div className="bg-canvas/30 border border-line p-4 rounded-xl">
                    <p className="text-3xl font-black text-accent">{team.leads ?? 0}</p>
                    <p className="text-[10px] text-muted font-bold uppercase mt-1">CRM leads</p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card variant="glass" className="p-6">
                <h3 className="text-[14px] font-bold text-ink tracking-tight mb-3">Deliverables Status</h3>
                <div className="space-y-3.5 text-xs font-semibold text-muted">
                  <div className="flex justify-between border-b border-line pb-1.5">
                    <span>Total tasks assigned</span>
                    <span className="text-ink font-bold">{teamTasks.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Completed tasks</span>
                    <span className="text-emerald-500 font-bold">{teamTasks.filter(t => t.completed).length}</span>
                  </div>
                </div>
              </Card>

            </div>
          </div>
        )}

        {activeTab === 'members' && (
          <Card className="p-6">
            <h3 className="text-[14px] font-bold text-ink tracking-tight mb-1">Team Members</h3>
            <p className="text-[11.5px] text-muted mb-4 font-medium">Assigned users on this workgroup</p>

            {teamMembers.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No members assigned to this team.</p>
            ) : (
              <div className="space-y-2">
                {teamMembers.map((m: any) => (
                  <div key={m.id} className="p-3 bg-canvas/30 border border-line rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar user={m.user ?? {}} size={28} />
                      <div>
                        <h4 className="text-xs font-bold text-ink">{m.user?.name || 'Pending Invite'}</h4>
                        <p className="text-[10px] text-muted mt-0.5">{m.user?.email}</p>
                      </div>
                    </div>
                    <Badge variant={m.role === 'OWNER' ? 'success' : 'neutral'} className="text-[9px] uppercase font-black">
                      {m.role}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'cards' && (
          <Card className="p-6">
            <h3 className="text-[14px] font-bold text-ink tracking-tight mb-1">Team Profiles</h3>
            <p className="text-[11.5px] text-muted mb-4 font-medium">Digital business cards published by team members</p>

            {teamCards.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No cards created by team members yet.</p>
            ) : (
              <div className="space-y-2">
                {teamCards.map((c) => (
                  <div key={c.id} className="p-3 bg-canvas/30 border border-line rounded-xl flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-ink">💳 {c.slug}</h4>
                      <p className="text-[10px] text-faint mt-0.5 font-mono">Owner: {c.owner?.name || c.ownerId}</p>
                    </div>
                    <Badge variant={c.isPublished ? 'success' : 'neutral'} className="text-[9px] uppercase font-black">
                      {c.isPublished ? 'Live' : 'Draft'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'crm' && (
          <Card className="p-6">
            <h3 className="text-[14px] font-bold text-ink tracking-tight mb-1">CRM Leads</h3>
            <p className="text-[11.5px] text-muted mb-4 font-medium">Contacts captured by team card templates</p>

            {teamLeads.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No leads captured yet.</p>
            ) : (
              <div className="space-y-2">
                {teamLeads.map((l) => (
                  <div key={l.id} className="p-3 bg-canvas/30 border border-line rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-ink">{l.name || 'Anonymous'}</p>
                      <p className="text-[10px] text-muted mt-0.5">{l.email} · {l.company}</p>
                    </div>
                    <Badge variant={l.temperature === 'HOT' ? 'error' : 'neutral'} className="text-[9px] font-black uppercase">
                      {l.temperature}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'analytics' && (
          <Card className="p-6">
            <h3 className="text-[14px] font-bold text-ink tracking-tight mb-1">Team Analytics</h3>
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-14 text-center">
              <Icon name="chart-bar" size={22} className="text-faint" />
              <p className="max-w-sm px-6 text-xs font-semibold text-muted">
                Per-team analytics aren’t broken out yet. Track engagement in the main Analytics page; team-scoped charts arrive once events are attributed to teams.
              </p>
            </div>
          </Card>
        )}

        {activeTab === 'meetings' && (
          <Card className="p-6">
            <h3 className="text-[14px] font-bold text-ink tracking-tight mb-1">Deliverable Meetings</h3>
            <p className="text-[11.5px] text-muted mb-4 font-medium">Calendar schedules booked by team leads</p>

            {upcomingMeetings.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No meetings scheduled.</p>
            ) : (
              <div className="space-y-2">
                {upcomingMeetings.map((m) => (
                  <div key={m.id} className="p-3 bg-canvas/30 border border-line rounded-xl text-xs font-semibold">
                    <div className="flex justify-between items-center">
                      <span className="text-ink font-bold">{m.name}</span>
                      <Badge variant="warning" className="text-[9px] uppercase font-black">Booked</Badge>
                    </div>
                    <p className="text-muted mt-1 text-[11px]">
                      📅 {new Date(m.meetingAt!).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'tasks' && (
          <Card className="p-6">
            <h3 className="text-[14px] font-bold text-ink tracking-tight mb-1">Deliverables checklist</h3>
            <p className="text-[11.5px] text-muted mb-4 font-medium">Tasks allocated to team seats</p>

            {teamTasks.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No tasks logged.</p>
            ) : (
              <div className="space-y-2.5">
                {teamTasks.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-2.5 p-3 bg-canvas/30 border border-line rounded-xl cursor-pointer hover:bg-canvas/60 transition-all text-xs font-semibold text-ink"
                  >
                    <input
                      type="checkbox"
                      checked={t.completed}
                      onChange={() => handleToggleTask(t.id, !t.completed)}
                      className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
                    />
                    <span className={t.completed ? 'line-through text-muted' : ''}>{t.title}</span>
                  </label>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'files' && (
          <Card className="p-6">
            <h3 className="text-[14px] font-bold text-ink tracking-tight mb-1">Team Shared Templates</h3>
            <p className="text-[11.5px] text-muted mb-4 font-medium">Files and media templates created by team members</p>

            {teamAssets.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No files uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {teamAssets.map((a) => (
                  <div key={a.id} className="p-3 bg-canvas/30 border border-line rounded-xl flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-ink">📄 {a.name}</p>
                      <p className="text-[10px] text-muted mt-0.5">{a.mimeType} · {(a.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <a href={a.url} target="_blank" rel="noreferrer" className="v-btn v-btn-ghost h-8 text-[11px] font-bold">
                      Download
                    </a>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'qrnfc' && (
          <Card className="p-6">
            <h3 className="text-[14.5px] font-bold text-ink tracking-tight mb-1">Linked QR & NFC Devices</h3>
            <p className="text-xs text-muted font-medium mb-4">Tags linked to team active profiles</p>

            {teamTags.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No linked NFC/QR tags detected on team card assets.</p>
            ) : (
              <div className="space-y-2">
                {teamTags.map((t) => (
                  <div key={t.id} className="p-3 bg-canvas/30 border border-line rounded-xl flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-ink">🏷️ {t.hardwareType || 'Device'} ({t.uid.slice(0, 8)})</p>
                      <p className="text-[10px] text-muted mt-0.5">Scans: {t.activationCount ?? 0} · Status: {t.status}</p>
                    </div>
                    <Badge variant={t.status === 'ACTIVE' ? 'success' : 'neutral'} className="text-[9px] uppercase font-black">
                      {t.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'audit' && (
          <Card className="p-6">
            <h3 className="text-[14.5px] font-bold text-ink tracking-tight mb-1">Team Audit history</h3>
            <p className="text-xs text-muted font-medium mb-4">Audit log events specific to this workgroup</p>

            {teamLogs.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No audit trail recorded.</p>
            ) : (
              <div className="space-y-2.5">
                {teamLogs.map((log) => (
                  <div key={log.id} className="p-2.5 bg-canvas/30 border border-line rounded-xl text-xs font-semibold text-muted flex justify-between">
                    <div>
                      <p className="text-ink font-bold">{log.action}</p>
                      <p className="text-[10px] text-faint mt-0.5">Actor User ID: {log.actorId?.slice(0, 12)}</p>
                    </div>
                    <span className="text-[10px] text-faint font-mono">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'settings' && (
          <Card className="p-6 max-w-xl">
            <h3 className="text-[14px] font-bold text-ink tracking-tight mb-4">Team Settings</h3>
            
            {isEditing ? (
              <form onSubmit={handleUpdateSettings} className="space-y-4">
                <label className="grid gap-1.5">
                  <span className="text-[11.5px] font-bold text-muted uppercase">Team Name</span>
                  <input className="v-field font-semibold" value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[11.5px] font-bold text-muted uppercase">Department</span>
                  <select className="v-field font-semibold" value={editDeptId} onChange={(e) => setEditDeptId(e.target.value)}>
                    <option value="">No Department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[11.5px] font-bold text-muted uppercase">Team Manager ID</span>
                  <input className="v-field font-semibold" value={editManagerId} onChange={(e) => setEditManagerId(e.target.value)} placeholder="User ID" />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[11.5px] font-bold text-muted uppercase">Accent Color</span>
                  <div className="flex gap-2 items-center">
                    <input type="color" className="h-8 w-10 rounded border border-line" value={editColor} onChange={(e) => setEditColor(e.target.value)} />
                    <input className="v-field font-semibold flex-1" value={editColor} onChange={(e) => setEditColor(e.target.value)} required />
                  </div>
                </label>

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)} className="font-bold">
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={saving} className="font-bold bg-accent text-white">
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 font-semibold text-xs text-muted">
                <div className="flex justify-between border-b border-line pb-2">
                  <span>Name</span>
                  <span className="text-ink font-bold">{team.name}</span>
                </div>
                <div className="flex justify-between border-b border-line pb-2">
                  <span>Department</span>
                  <span className="text-ink font-bold">{team.department?.name || 'None'}</span>
                </div>
                <div className="flex justify-between border-b border-line pb-2">
                  <span>Manager ID</span>
                  <span className="text-ink font-bold font-mono">{team.managerId || 'None'}</span>
                </div>
                <div className="flex justify-between border-b border-line pb-2">
                  <span>Color Theme</span>
                  <span className="flex items-center gap-1.5 font-mono text-ink">
                    <span className="h-3.5 w-3.5 rounded" style={{ background: teamColor }} />
                    {teamColor}
                  </span>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="font-bold">
                    Edit Team
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDelete} className="font-bold !text-red-500 hover:!bg-red-500/10 border-red-500/20">
                    Delete Team
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </AppShell>
  );
}
