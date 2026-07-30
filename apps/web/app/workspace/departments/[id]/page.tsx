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
  | 'teams'
  | 'members'
  | 'cards'
  | 'crm'
  | 'analytics'
  | 'meetings'
  | 'tasks'
  | 'files'
  | 'settings'
  | 'activity';

const getHealth = (score: number) => {
  if (score >= 80) return { label: 'Excellent', badge: 'success', dot: '🟢' };
  if (score >= 50) return { label: 'Good', badge: 'warning', dot: '🟡' };
  if (score >= 25) return { label: 'Needs Attention', badge: 'warning', dot: '🟠' };
  return { label: 'Critical', badge: 'error', dot: '🔴' };
};

export default function DepartmentPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dept, setDept] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Shared entity lists
  const [allCards, setAllCards] = useState<any[]>([]);
  const [allLeads, setAllLeads] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [allLogs, setAllLogs] = useState<any[]>([]);
  const [allAssets, setAllAssets] = useState<any[]>([]);

  // Settings edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editManagerId, setEditManagerId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, crds, lds, tsks, logs, asts] = await Promise.all([
        authFetch<any>(`/orgs/departments/${params.id}`),
        authFetch<any[]>('/cards').catch(() => []),
        authFetch<any[]>('/leads').catch(() => []),
        authFetch<any[]>('/tasks').catch(() => []),
        authFetch<any[]>('/orgs/audit-logs').catch(() => []),
        authFetch<any[]>('/orgs/assets').catch(() => []),
      ]);
      setDept(data);
      setAllCards(crds);
      setAllLeads(lds);
      setAllTasks(tsks);
      setAllLogs(logs);
      setAllAssets(asts);
      setEditName(data.name);
      setEditColor(data.color || '#2563eb');
      setEditManagerId(data.managerId || '');
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
      await authFetch(`/orgs/departments/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          color: editColor,
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
    if (!confirm('Are you sure you want to delete this department? Teams and members will be unassigned.')) return;
    try {
      await authFetch(`/orgs/departments/${params.id}`, { method: 'DELETE' });
      router.replace('/team');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Filtered computed lists for this department
  const memberUserIds = useMemo(() => {
    if (!dept?.memberships) return [];
    return dept.memberships.map((m: any) => m.userId);
  }, [dept]);

  const departmentCards = useMemo(() => {
    return allCards.filter((c) => memberUserIds.includes(c.ownerId));
  }, [allCards, memberUserIds]);

  const departmentLeads = useMemo(() => {
    return allLeads.filter((l) => l.ownerId && memberUserIds.includes(l.ownerId));
  }, [allLeads, memberUserIds]);

  const departmentTasks = useMemo(() => {
    return allTasks.filter((t) => t.userId && memberUserIds.includes(t.userId));
  }, [allTasks, memberUserIds]);

  const departmentLogs = useMemo(() => {
    return allLogs.filter((l) => l.targetType === 'DEPARTMENT' && l.targetId === params.id);
  }, [allLogs, params.id]);

  const departmentAssets = useMemo(() => {
    return allAssets.filter((a) => memberUserIds.includes(a.ownerId));
  }, [allAssets, memberUserIds]);

  const upcomingMeetings = useMemo(() => {
    return departmentLeads
      .filter((l) => l.intent === 'MEETING' && l.meetingAt)
      .sort((a, b) => new Date(a.meetingAt!).getTime() - new Date(b.meetingAt!).getTime());
  }, [departmentLeads]);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'gauge' },
    { id: 'teams', label: 'Teams', icon: 'grid' },
    { id: 'members', label: 'Members', icon: 'users' },
    { id: 'cards', label: 'Cards', icon: 'columns' },
    { id: 'crm', label: 'CRM', icon: 'inbox' },
    { id: 'analytics', label: 'Analytics', icon: 'chart-bar' },
    { id: 'meetings', label: 'Meetings', icon: 'calendar' },
    { id: 'tasks', label: 'Tasks', icon: 'check-circle' },
    { id: 'files', label: 'Files', icon: 'file-text' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
    { id: 'activity', label: 'Activity', icon: 'clock' },
  ] as const;

  if (loading) {
    return (
      <AppShell title="Loading Department...">
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

  if (error || !dept) {
    return (
      <AppShell title="Error">
        <Alert variant="error" className="mb-6">
          {error || 'Department not found.'}
        </Alert>
        <Link href="/team" className="text-accent font-bold hover:underline">
          ← Back to Workspace Directory
        </Link>
      </AppShell>
    );
  }

  const deptColor = dept.color || '#2563eb';

  return (
    <AppShell title={`${dept.name} Department`}>
      {/* Header Info */}
      <div className="mb-6 bg-surface border border-line rounded-2xl p-6 shadow-sm flex items-center justify-between gap-4 flex-wrap relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full" style={{ background: deptColor }} />
        <div className="space-y-1.5 pl-2">
          <div className="flex items-center gap-2">
            <h2 className="v-display text-[18px] font-black text-ink">{dept.name} Department</h2>
            <Badge variant="neutral" className="font-black !text-[8.5px] uppercase">
              {dept.memberships?.length ?? 0} {(dept.memberships?.length ?? 0) === 1 ? 'seat' : 'seats'}
            </Badge>
          </div>
          <p className="text-xs text-muted font-semibold flex items-center gap-1.5">
            <span>Department Head:</span>
            <span className="text-ink font-bold">{dept.manager?.name || dept.manager?.email || 'Unassigned'}</span>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <Card variant="standard" className="p-5 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase">Teams affiliated</p>
                  <h3 className="text-2xl font-black text-ink mt-2">{dept.teams?.length ?? 0}</h3>
                </Card>
                <Card variant="standard" className="p-5 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase">Department seats</p>
                  <h3 className="text-2xl font-black text-ink mt-2">{dept.memberships?.length ?? 0}</h3>
                </Card>
                <Card variant="standard" className="p-5 text-center">
                  <p className="text-[10px] font-bold text-muted uppercase">Members</p>
                  <h3 className="text-2xl font-black text-ink mt-2">{dept.memberships?.length ?? 0}</h3>
                </Card>
              </div>

              {/* Department Overview Details */}
              <Card variant="standard" className="p-6">
                <h3 className="text-[14.5px] font-black text-ink tracking-tight mb-3">Department Summary</h3>
                <p className="text-xs text-muted leading-relaxed font-semibold">
                  The {dept.name} department groups {dept.teams?.length ?? 0} {(dept.teams?.length ?? 0) === 1 ? 'team' : 'teams'} and {dept.memberships?.length ?? 0} {(dept.memberships?.length ?? 0) === 1 ? 'member' : 'members'} in this workspace. Managers can assign members to teams and CRM pipelines.
                </p>
              </Card>
            </div>

            {/* Right Column: Manager Detail */}
            <div className="space-y-6">
              <Card variant="glass" className="p-6">
                <h3 className="text-[14px] font-bold text-ink tracking-tight mb-3">Department Head</h3>
                <div className="flex items-center gap-3">
                  {dept.manager ? (
                    <Avatar user={dept.manager} size={40} />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-canvas text-faint">
                      <Icon name="user" size={16} />
                    </span>
                  )}
                  <div>
                    <h4 className="text-xs font-bold text-ink">{dept.manager?.name || 'Unassigned Manager'}</h4>
                    <p className="text-[10px] text-muted mt-0.5">{dept.manager?.email || 'No email on file'}</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'teams' && (
          <Card className="p-6">
            <h3 className="text-[14px] font-bold text-ink tracking-tight mb-1">Affiliated Teams</h3>
            <p className="text-[11.5px] text-muted mb-4 font-medium">Workgroups belonging to the {dept.name} department</p>

            {(!dept.teams || dept.teams.length === 0) ? (
              <p className="text-xs text-muted text-center py-8">No teams associated with this department yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {dept.teams.map((t: any) => (
                  <div key={t.id} className="p-4 bg-canvas/30 border border-line rounded-xl flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-ink">{t.name}</h4>
                      <p className="text-[10.5px] text-muted mt-0.5">Manager: {t.manager?.name || 'Unassigned'}</p>
                    </div>
                    <Link href={`/workspace/teams/${t.id}`} className="v-btn v-btn-ghost !h-8 text-[11px] font-bold">
                      View →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'members' && (
          <Card className="p-6">
            <h3 className="text-[14px] font-bold text-ink tracking-tight mb-1">Affiliated Members</h3>
            <p className="text-[11.5px] text-muted mb-4 font-medium">Team members assigned to the {dept.name} department</p>

            {(!dept.memberships || dept.memberships.length === 0) ? (
              <p className="text-xs text-muted text-center py-8">No members assigned to this department yet.</p>
            ) : (
              <div className="space-y-2">
                {dept.memberships.map((m: any) => (
                  <div key={m.id} className="p-3 bg-canvas/30 border border-line rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar user={m.user ?? {}} size={28} />
                      <div>
                        <h4 className="text-xs font-bold text-ink">{m.user?.name || 'Pending Invite'}</h4>
                        <p className="text-[10px] text-muted mt-0.5">{m.user?.email}</p>
                      </div>
                    </div>
                    <Badge variant={m.role === 'OWNER' ? 'success' : 'neutral'} className="text-[9px] uppercase tracking-wider font-black">
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
            <h3 className="text-[14px] font-bold text-ink tracking-tight mb-1">Department NFC Cards</h3>
            <p className="text-[11.5px] text-muted mb-4 font-medium">Digital card profiles assigned to managers and employees within this department.</p>

            {departmentCards.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No cards created by department members yet.</p>
            ) : (
              <div className="space-y-2">
                {departmentCards.map((c) => (
                  <div key={c.id} className="p-3 bg-canvas/30 border border-line rounded-xl flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-ink">💳 {c.slug}</h4>
                      <p className="text-[10px] text-faint mt-0.5 font-mono">Owner Token: {c.ownerId?.slice(0, 12)}...</p>
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
            <h3 className="text-[14.5px] font-bold text-ink tracking-tight mb-1">CRM Leads Pipeline</h3>
            <p className="text-xs text-muted font-medium mb-4">Leads captured by members of the {dept.name} department</p>

            {departmentLeads.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No leads captured yet.</p>
            ) : (
              <div className="space-y-2">
                {departmentLeads.map((l) => (
                  <div key={l.id} className="p-3 bg-canvas/30 border border-line rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-ink">{l.name || 'Anonymous Contact'}</p>
                      <p className="text-[10px] text-muted font-medium mt-0.5">{l.email || 'No email'} · {l.company || 'Direct'}</p>
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
            <h3 className="text-[14.5px] font-bold text-ink tracking-tight mb-1">Department Analytics</h3>
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-14 text-center">
              <Icon name="chart-bar" size={22} className="text-faint" />
              <p className="max-w-sm px-6 text-xs font-semibold text-muted">
                Per-department analytics aren’t broken out yet. Track engagement in the main Analytics page; department-scoped charts arrive once events are attributed to departments.
              </p>
            </div>
          </Card>
        )}

        {activeTab === 'meetings' && (
          <Card className="p-6">
            <h3 className="text-[14.5px] font-bold text-ink tracking-tight mb-1">Scheduled Meetings</h3>
            <p className="text-xs text-muted font-medium mb-4">Meetings booked through department profile links</p>

            {upcomingMeetings.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No upcoming meetings scheduled.</p>
            ) : (
              <div className="space-y-2">
                {upcomingMeetings.map((m) => (
                  <div key={m.id} className="p-3 bg-canvas/30 border border-line rounded-xl text-xs font-semibold">
                    <div className="flex justify-between items-center">
                      <span className="text-ink font-bold">{m.name}</span>
                      <Badge variant="warning" className="text-[9px] uppercase font-black">Booked</Badge>
                    </div>
                    <p className="text-muted mt-1 text-[11px]">
                      📅 {new Date(m.meetingAt!).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'tasks' && (
          <Card className="p-6">
            <h3 className="text-[14.5px] font-bold text-ink tracking-tight mb-1">Deliverables & Progress</h3>
            <p className="text-xs text-muted font-medium mb-4">Checklist tasks assigned to department seats</p>

            {departmentTasks.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No tasks recorded.</p>
            ) : (
              <div className="space-y-2.5">
                {departmentTasks.map((t) => (
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
            <h3 className="text-[14.5px] font-bold text-ink tracking-tight mb-1">Department Shared Files</h3>
            <p className="text-xs text-muted font-medium mb-4 font-semibold text-muted">Media assets, corporate templates, and files uploaded by department members</p>

            {departmentAssets.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No files uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {departmentAssets.map((a) => (
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

        {activeTab === 'activity' && (
          <Card className="p-6">
            <h3 className="text-[14.5px] font-bold text-ink tracking-tight mb-1">Department Activity Logs</h3>
            <p className="text-xs text-muted font-medium mb-4">Audit history trails specific to this department</p>

            {departmentLogs.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No recent events logged for this department.</p>
            ) : (
              <div className="space-y-2.5">
                {departmentLogs.map((log) => (
                  <div key={log.id} className="p-2.5 bg-canvas/30 border border-line rounded-xl text-xs font-semibold text-muted flex justify-between">
                    <div>
                      <p className="text-ink font-bold">{log.action}</p>
                      <p className="text-[10px] text-faint mt-0.5">Author Token ID: {log.actorId?.slice(0, 12)}</p>
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
            <h3 className="text-[14px] font-bold text-ink tracking-tight mb-4">Department Settings</h3>
            
            {isEditing ? (
              <form onSubmit={handleUpdateSettings} className="space-y-4">
                <label className="grid gap-1.5">
                  <span className="text-[11.5px] font-bold text-muted uppercase">Department Name</span>
                  <input className="v-field font-semibold" value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11.5px] font-bold text-muted uppercase">Department Manager / Head ID</span>
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
                  <span className="text-ink font-bold">{dept.name}</span>
                </div>
                <div className="flex justify-between border-b border-line pb-2">
                  <span>Manager / Head ID</span>
                  <span className="text-ink font-bold font-mono">{dept.managerId || 'Not assigned'}</span>
                </div>
                <div className="flex justify-between border-b border-line pb-2">
                  <span>Color Theme</span>
                  <span className="flex items-center gap-1.5 font-mono text-ink">
                    <span className="h-3.5 w-3.5 rounded" style={{ background: deptColor }} />
                    {deptColor}
                  </span>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="font-bold">
                    Edit Department
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDelete} className="font-bold !text-red-500 hover:!bg-red-500/10 border-red-500/20">
                    Delete Department
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
