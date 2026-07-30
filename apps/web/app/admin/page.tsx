'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { authFetch, getToken, saveTokens, setActiveOrgId } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { Sparkline } from '@/components/charts/Sparkline';
import { AreaChart } from '@/components/charts/AreaChart';
import { VMark } from '@/components/brand/VMark';

// Design System
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Badge,
  ProgressBar,
  Input,
  Select,
  Switch,
  Alert,
  Skeleton,
} from '@/design-system';

interface KPIOverview {
  totals: {
    users: number;
    /** Users holding at least one active membership. */
    activeUsers: number;
    organizations: number;
    cards: number;
    publishedCards: number;
    nfcDevices: number;
    activeNfc: number;
    leads: number;
    profileViews: number;
    mrr: number;
    arr: number;
    /** Enterprise is contract-priced, so it is counted, not folded into MRR. */
    enterpriseSubs: number;
    dbSize: string | null;
  };
  system: {
    uptimeSeconds: number;
    memoryMb: number;
    activeJobs: number;
    failedJobs: number;
  };
}

interface UserAdmin {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  isSuperAdmin: boolean;
  organizations: { id: string; name: string; role: string; status: string }[];
  cardsCount: number;
  leadsCount: number;
}

interface OrgAdmin {
  id: string;
  name: string;
  slug: string;
  plan: 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
  isActive: boolean;
  createdAt: string;
  owner: { id: string; name: string | null; email: string } | null;
  membersCount: number;
  cardsCount: number;
  nfcCount: number;
  leadsCount: number;
}

interface FeatureFlag {
  id: string;
  name: string;
  status: boolean;
  rollout: number;
  targeting: string;
}

interface QueueJob {
  id: string;
  name: string;
  status: 'RUNNING' | 'QUEUED' | 'COMPLETED' | 'FAILED';
  progress: number;
  duration: string;
  worker: string;
  startedAt: string;
  error?: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
  actor: { name: string | null; email: string } | null;
  orgName: string;
  metadata: any;
}

export default function AdminConsole() {
  const router = useRouter();
  const { t } = useTranslation('admin');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'organizations' | 'nfc-qr' | 'jobs' | 'flags' | 'security' | 'logs' | 'developer'>('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [me, setMe] = useState<any>(null);

  // States for DB data
  const [kpi, setKpi] = useState<KPIOverview | null>(null);
  const [users, setUsers] = useState<UserAdmin[]>([]);
  const [orgs, setOrgs] = useState<OrgAdmin[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Search/Filters
  const [userSearch, setUserSearch] = useState('');
  const [orgSearch, setOrgSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [userFilter, setUserFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED' | 'ADMIN'>('ALL');

  // Modals / Create States
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [nfcImportText, setNfcImportText] = useState('');
  const [nfcHardwareType, setNfcHardwareType] = useState<'CARD' | 'STICKER' | 'KEYCHAIN' | 'WRISTBAND'>('CARD');
  const [errorMessage, setErrorMessage] = useState('');

  // Command Palette
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState('');

  // Create User States
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [newIsSuperAdmin, setNewIsSuperAdmin] = useState(false);
  
  // Create Org States
  const [createOrgModalOpen, setCreateOrgModalOpen] = useState(false);
  const [newOrganizationName, setNewOrganizationName] = useState('');
  const [newOrgPlan, setNewOrgPlan] = useState<'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE'>('FREE');
  const [ownerOption, setOwnerOption] = useState<'existing' | 'new'>('existing');
  const [newOrgOwnerEmail, setNewOrgOwnerEmail] = useState('');
  const [newOrgOwnerName, setNewOrgOwnerName] = useState('');
  const [newOrgOwnerPassword, setNewOrgOwnerPassword] = useState('');

  // Change Org Owner States
  const [changeOwnerModalOpen, setChangeOwnerModalOpen] = useState(false);
  const [changeOwnerOrgId, setChangeOwnerOrgId] = useState('');
  const [changeOwnerOrgName, setChangeOwnerOrgName] = useState('');
  const [changeOwnerEmail, setChangeOwnerEmail] = useState('');
  const [changeOwnerName, setChangeOwnerName] = useState('');
  const [changeOwnerPassword, setChangeOwnerPassword] = useState('');

  // Delete Org States
  const [deleteOrgModalOpen, setDeleteOrgModalOpen] = useState(false);
  const [deleteOrgId, setDeleteOrgId] = useState('');
  const [deleteOrgName, setDeleteOrgName] = useState('');

  // Modal feedback status states
  const [createOrgStatus, setCreateOrgStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [changeOwnerStatus, setChangeOwnerStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // IP block list simulation
  const [blockedIPs, setBlockedIPs] = useState<string[]>([]);
  const [newBlockedIP, setNewBlockedIP] = useState('');

  // Load Admin Data
  const loadData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      // 1. Verify User Session & Super Admin Status
      const myProfile = await authFetch<any>('/auth/me');
      setMe(myProfile);

      if (!myProfile.isSuperAdmin) {
        setLoading(false);
        // Redirect to regular dashboard if not a super admin
        router.replace('/dashboard');
        return;
      }

      // 2. Fetch admin datasets
      const [kpiRes, usersRes, orgsRes, flagsRes, jobsRes, logsRes] = await Promise.all([
        authFetch<KPIOverview>('/admin/kpis'),
        authFetch<UserAdmin[]>('/admin/users'),
        authFetch<OrgAdmin[]>('/admin/organizations'),
        authFetch<FeatureFlag[]>('/admin/feature-flags'),
        authFetch<QueueJob[]>('/admin/queue-jobs'),
        authFetch<AuditLogEntry[]>('/admin/audit-logs'),
      ]);

      setKpi(kpiRes);
      setUsers(usersRes);
      setOrgs(orgsRes);
      setFlags(flagsRes);
      setJobs(jobsRes);
      setAuditLogs(logsRes);
    } catch (e) {
      setErrorMessage((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    const savedTheme = (localStorage.getItem('vertex_theme') as 'light' | 'dark') || 'dark';
    setTheme(savedTheme);
    loadData();

    // Hotkeys handler
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('vertex_theme', next);
  };

  // Filters calculation
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.name && u.name.toLowerCase().includes(userSearch.toLowerCase()));
      if (!matchSearch) return false;

      if (userFilter === 'ADMIN') return u.isSuperAdmin;
      if (userFilter === 'SUSPENDED') return u.organizations.some((o) => o.status === 'SUSPENDED');
      if (userFilter === 'ACTIVE') return u.organizations.some((o) => o.status === 'ACTIVE');
      return true;
    });
  }, [users, userSearch, userFilter]);

  const filteredOrgs = useMemo(() => {
    return orgs.filter((o) => o.name.toLowerCase().includes(orgSearch.toLowerCase()) || o.slug.toLowerCase().includes(orgSearch.toLowerCase()));
  }, [orgs, orgSearch]);

  const filteredLogs = useMemo(() => {
    return auditLogs.filter((l) => {
      const query = logSearch.toLowerCase();
      return (
        l.action.toLowerCase().includes(query) ||
        (l.actor && l.actor.email.toLowerCase().includes(query)) ||
        l.orgName.toLowerCase().includes(query)
      );
    });
  }, [auditLogs, logSearch]);

  // Actions
  const handleToggleUserAdmin = async (userId: string, currentVal: boolean) => {
    setActionLoading(true);
    try {
      await authFetch(`/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isSuperAdmin: !currentVal }),
      });
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateUserStatus = async (userId: string, nextStatus: 'ACTIVE' | 'SUSPENDED') => {
    setActionLoading(true);
    try {
      await authFetch(`/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleImpersonateUser = async (userId: string) => {
    setActionLoading(true);
    try {
      const session = await authFetch<{ accessToken: string; refreshToken: string; orgId?: string }>(
        `/admin/users/${userId}/impersonate`,
        { method: 'POST' }
      );
      saveTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken });
      setActiveOrgId(session.orgId || null);
      // Redirect to user dashboard
      window.location.href = '/dashboard';
    } catch (e) {
      alert((e as Error).message);
      setActionLoading(false);
    }
  };

  const handleUpgradeOrg = async (orgId: string, nextPlan: string) => {
    setActionLoading(true);
    try {
      await authFetch(`/admin/organizations/${orgId}/plan`, {
        method: 'PATCH',
        body: JSON.stringify({ plan: nextPlan }),
      });
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleFlag = async (flagId: string) => {
    try {
      await authFetch(`/admin/feature-flags/${flagId}/toggle`, { method: 'PATCH' });
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleJobAction = async (jobId: string, action: 'RETRY' | 'CANCEL' | 'PAUSE' | 'RESUME') => {
    try {
      await authFetch(`/admin/queue-jobs/${jobId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleImportNfcTags = async () => {
    if (!nfcImportText.trim()) return;
    const uids = nfcImportText.split('\n').map((l) => l.trim()).filter(Boolean);
    setActionLoading(true);
    try {
      await authFetch('/nfc/tags/batch', {
        method: 'POST',
        body: JSON.stringify({
          uids,
          hardwareType: nfcHardwareType,
          batchId: `BATCH-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
        }),
      });
      setNfcImportText('');
      alert('NFC Tags batch imported and initialized successfully.');
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newOrgName.trim()) return;
    setActionLoading(true);
    try {
      await authFetch('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: newEmail,
          name: newName,
          password: newPassword || 'Password123!',
          organizationName: newOrgName,
          isSuperAdmin: newIsSuperAdmin,
        }),
      });
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewOrgName('');
      setNewIsSuperAdmin(false);
      setCreateUserModalOpen(false);
      alert('User account and organization workspace created successfully.');
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrganizationName.trim() || !newOrgOwnerEmail.trim()) return;
    setActionLoading(true);
    setCreateOrgStatus(null);
    try {
      await authFetch('/admin/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: newOrganizationName,
          plan: newOrgPlan,
          ownerEmail: newOrgOwnerEmail,
          ...(ownerOption === 'new' ? {
            ownerName: newOrgOwnerName,
            ownerPassword: newOrgOwnerPassword || 'Password123!',
          } : {}),
        }),
      });
      setCreateOrgStatus({ type: 'success', message: 'Organization created successfully!' });
      setNewOrganizationName('');
      setNewOrgPlan('FREE');
      setNewOrgOwnerEmail('');
      setNewOrgOwnerName('');
      setNewOrgOwnerPassword('');
      setTimeout(() => {
        setCreateOrgModalOpen(false);
        setCreateOrgStatus(null);
        loadData();
      }, 1500);
    } catch (e) {
      setCreateOrgStatus({ type: 'error', message: (e as Error).message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleOrgStatus = async (orgId: string, currentStatus: boolean) => {
    setActionLoading(true);
    try {
      await authFetch(`/admin/organizations/${orgId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteOrganization = async () => {
    setActionLoading(true);
    try {
      await authFetch(`/admin/organizations/${deleteOrgId}`, {
        method: 'DELETE',
      });
      setDeleteOrgModalOpen(false);
      setDeleteOrgId('');
      setDeleteOrgName('');
      alert('Organization deleted successfully.');
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeOrgOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeOwnerEmail.trim()) return;
    setActionLoading(true);
    setChangeOwnerStatus(null);
    try {
      await authFetch(`/admin/organizations/${changeOwnerOrgId}/owner`, {
        method: 'PATCH',
        body: JSON.stringify({
          ownerEmail: changeOwnerEmail,
          ownerName: changeOwnerName,
          ownerPassword: changeOwnerPassword || 'Password123!',
        }),
      });
      setChangeOwnerStatus({ type: 'success', message: 'Organization owner updated successfully!' });
      setChangeOwnerEmail('');
      setChangeOwnerName('');
      setChangeOwnerPassword('');
      setTimeout(() => {
        setChangeOwnerModalOpen(false);
        setChangeOwnerStatus(null);
        loadData();
      }, 1500);
    } catch (e) {
      setChangeOwnerStatus({ type: 'error', message: (e as Error).message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlockIP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockedIP.trim()) return;
    setBlockedIPs([...blockedIPs, newBlockedIP.trim()]);
    setNewBlockedIP('');
  };

  const handleUnblockIP = (ip: string) => {
    setBlockedIPs(blockedIPs.filter((item) => item !== ip));
  };

  // Command Palette Command Search
  const commandList = [
    { label: 'Go to Executive Dashboard', action: () => { setActiveTab('dashboard'); setCommandPaletteOpen(false); } },
    { label: 'Go to User Management', action: () => { setActiveTab('users'); setCommandPaletteOpen(false); } },
    { label: 'Go to Organization Operations', action: () => { setActiveTab('organizations'); setCommandPaletteOpen(false); } },
    { label: 'Go to NFC & QR Center', action: () => { setActiveTab('nfc-qr'); setCommandPaletteOpen(false); } },
    { label: 'Go to Background Jobs & Queues', action: () => { setActiveTab('jobs'); setCommandPaletteOpen(false); } },
    { label: 'Go to Feature Flags Configuration', action: () => { setActiveTab('flags'); setCommandPaletteOpen(false); } },
    { label: 'Go to Security & Firewall', action: () => { setActiveTab('security'); setCommandPaletteOpen(false); } },
    { label: 'Go to Platform Audit Logs', action: () => { setActiveTab('logs'); setCommandPaletteOpen(false); } },
    { label: 'Go to Developer & System Config', action: () => { setActiveTab('developer'); setCommandPaletteOpen(false); } },
    { label: 'Toggle Theme (Light / Dark)', action: () => { toggleTheme(); setCommandPaletteOpen(false); } },
    { label: 'Refresh All Platform Metrics', action: () => { loadData(); setCommandPaletteOpen(false); } },
    { label: 'Log out from Administration Panel', action: () => { localStorage.clear(); window.location.href = '/login'; } },
  ];

  const filteredCommands = commandList.filter((c) => c.label.toLowerCase().includes(commandSearch.toLowerCase()));

  if (loading) {
    return (
      <div data-theme={theme} className="min-h-screen bg-canvas text-ink flex items-center justify-center p-12">
        <div className="w-full max-w-lg space-y-6">
          <div className="flex items-center gap-3 justify-center mb-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-accent text-white"><VMark size={18} strokeWidth={3} /></span>
            <span className="text-xl font-extrabold tracking-tight">Enterprise Console</span>
          </div>
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div
      data-theme={theme}
      style={{ '--v-accent': '#2563eb', '--v-accent-contrast': '#ffffff' } as React.CSSProperties}
      className="min-h-screen bg-canvas text-ink antialiased flex"
    >
      {/* Side Navigation */}
      <aside className="w-[280px] bg-surface border-e border-line flex flex-col shrink-0">
        {/* Brand */}
        <div className="p-6 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white shadow-md">
              <VMark size={16} strokeWidth={3} />
            </span>
            <div className="flex flex-col">
              <span className="text-[14px] font-extrabold tracking-tight leading-none">Vertex Connect</span>
              <span className="text-[9.5px] font-bold text-accent tracking-widest uppercase mt-0.5">Control Center</span>
            </div>
          </div>
          <Badge variant="error" className="text-[9px] px-1.5 py-0.5">PLATFORM</Badge>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1.5">
          <div className="text-[10px] font-extrabold text-[hsl(var(--v-faint))] tracking-wider uppercase px-3 mb-2">Operations</div>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
              activeTab === 'dashboard' ? 'text-white shadow-sm [background:var(--v-gradient-brand)]' : 'text-muted hover:bg-canvas/40 hover:text-ink'
            }`}
          >
            <span className="flex items-center gap-3"><Icon name="gauge" size={15} /> Executive Overview</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
              activeTab === 'users' ? 'text-white shadow-sm [background:var(--v-gradient-brand)]' : 'text-muted hover:bg-canvas/40 hover:text-ink'
            }`}
          >
            <span className="flex items-center gap-3"><Icon name="users" size={15} /> User Management</span>
            <Badge variant="neutral" className="text-[10px]">{users.length}</Badge>
          </button>

          <button
            onClick={() => setActiveTab('organizations')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
              activeTab === 'organizations' ? 'text-white shadow-sm [background:var(--v-gradient-brand)]' : 'text-muted hover:bg-canvas/40 hover:text-ink'
            }`}
          >
            <span className="flex items-center gap-3"><Icon name="grid" size={15} /> Tenant Organizations</span>
            <Badge variant="neutral" className="text-[10px]">{orgs.length}</Badge>
          </button>

          <button
            onClick={() => setActiveTab('nfc-qr')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
              activeTab === 'nfc-qr' ? 'text-white shadow-sm [background:var(--v-gradient-brand)]' : 'text-muted hover:bg-canvas/40 hover:text-ink'
            }`}
          >
            <span className="flex items-center gap-3"><Icon name="tag" size={15} /> NFC & QR Inventory</span>
          </button>

          <div className="text-[10px] font-extrabold text-[hsl(var(--v-faint))] tracking-wider uppercase px-3 pt-6 mb-2">Systems</div>
          
          <button
            onClick={() => setActiveTab('jobs')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
              activeTab === 'jobs' ? 'text-white shadow-sm [background:var(--v-gradient-brand)]' : 'text-muted hover:bg-canvas/40 hover:text-ink'
            }`}
          >
            <span className="flex items-center gap-3"><Icon name="inbox" size={15} /> Background Queues</span>
            {jobs.some((j) => j.status === 'FAILED') && (
              <Badge variant="error" className="text-[9px] animate-pulse">ERR</Badge>
            )}
          </button>

          <button
            onClick={() => setActiveTab('flags')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
              activeTab === 'flags' ? 'text-white shadow-sm [background:var(--v-gradient-brand)]' : 'text-muted hover:bg-canvas/40 hover:text-ink'
            }`}
          >
            <span className="flex items-center gap-3"><Icon name="lock" size={15} /> Feature Rollouts</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
              activeTab === 'security' ? 'text-white shadow-sm [background:var(--v-gradient-brand)]' : 'text-muted hover:bg-canvas/40 hover:text-ink'
            }`}
          >
            <span className="flex items-center gap-3"><Icon name="shield" size={15} /> Firewall & Security</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
              activeTab === 'logs' ? 'text-white shadow-sm [background:var(--v-gradient-brand)]' : 'text-muted hover:bg-canvas/40 hover:text-ink'
            }`}
          >
            <span className="flex items-center gap-3"><Icon name="file-text" size={15} /> Platform Audit Logs</span>
          </button>

          <button
            onClick={() => setActiveTab('developer')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
              activeTab === 'developer' ? 'text-white shadow-sm [background:var(--v-gradient-brand)]' : 'text-muted hover:bg-canvas/40 hover:text-ink'
            }`}
          >
            <span className="flex items-center gap-3"><Icon name="gauge" size={15} /> Developer Console</span>
          </button>
        </nav>

        {/* User Card */}
        <div className="p-4 border-t border-line bg-canvas/30 space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-white text-[11px] font-black uppercase">
              {me?.name?.charAt(0) ?? 'SA'}
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-[12px] font-extrabold truncate">{me?.name || 'Administrator'}</span>
              <span className="text-[10px] text-muted truncate">{me?.email}</span>
            </div>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="v-btn v-btn-ghost w-full !h-9 text-[12px] font-bold"
          >
            <Icon name="arrow-left" size={14} /> Back to app
          </button>
          <div className="flex gap-2">
            <button
              onClick={toggleTheme}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-surface py-2 text-[11.5px] font-bold text-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              <Icon name={theme === 'light' ? 'moon' : 'sun'} size={13} />
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
            <button
              onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-red-500/20 bg-red-500/5 py-2 text-[11.5px] font-bold text-red-500 transition-colors hover:bg-red-500/10"
            >
              <Icon name="logout" size={13} /> Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main View Area */}
      <main className="flex-1 overflow-y-auto bg-canvas flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-[70px] bg-surface border-b border-line px-8 flex items-center justify-between shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <h1 className="text-[18px] font-black capitalize tracking-tight flex items-center gap-2">
              {activeTab === 'nfc-qr' ? 'NFC & QR Inventory' : activeTab.replace('-', ' ')}
            </h1>
            {actionLoading && <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />}
          </div>

          <div className="flex items-center gap-4">
            {/* Global Search/Command Palette trigger */}
            <div
              onClick={() => setCommandPaletteOpen(true)}
              className="hidden md:flex items-center justify-between gap-6 px-3.5 py-2 rounded-xl border border-line bg-canvas/60 hover:bg-canvas text-muted transition-colors cursor-pointer select-none text-[12.5px] w-64"
            >
              <span className="flex items-center gap-2"><Icon name="search" size={13} /> Search command...</span>
              <span className="text-[10px] font-mono border border-line bg-surface px-1.5 py-0.5 rounded-lg">Ctrl+K</span>
            </div>

            <Button size="sm" variant="outline" onClick={loadData}>
              <Icon name="refresh" size={12} className="mr-1.5" /> Refresh
            </Button>
          </div>
        </header>

        {/* Content Area */}
        <div className="p-8 flex-1 space-y-6">
          {errorMessage && (
            <Alert variant="error" className="mb-4">
              {errorMessage}
            </Alert>
          )}

          {/* TAB 1: EXECUTIVE DASHBOARD */}
          {activeTab === 'dashboard' && kpi && (
            <div className="space-y-6">
              {/* Live KPI Grid — real platform totals, no fabricated deltas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="hover:shadow-md transition-shadow">
                  <CardBody className="p-5 flex flex-col justify-between h-32">
                    <span className="text-[11.5px] font-extrabold tracking-wider text-muted uppercase">Total Users</span>
                    <div>
                      <div className="text-[28px] font-extrabold leading-none tracking-tight">{kpi.totals.users}</div>
                      <span className="text-[10px] text-muted mt-1.5 inline-block">Active: {kpi.totals.activeUsers}</span>
                    </div>
                  </CardBody>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                  <CardBody className="p-5 flex flex-col justify-between h-32">
                    <span className="text-[11.5px] font-extrabold tracking-wider text-muted uppercase">Organizations</span>
                    <div>
                      <div className="text-[28px] font-extrabold leading-none tracking-tight">{kpi.totals.organizations}</div>
                      <span className="text-[10px] text-muted mt-1.5 inline-block">Cards: {kpi.totals.cards}</span>
                    </div>
                  </CardBody>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                  <CardBody className="p-5 flex flex-col justify-between h-32">
                    <span className="text-[11.5px] font-extrabold tracking-wider text-muted uppercase">Active NFC Devices</span>
                    <div>
                      <div className="text-[28px] font-extrabold leading-none tracking-tight">{kpi.totals.activeNfc}</div>
                      <span className="text-[10px] text-muted mt-1.5 inline-block">Registered: {kpi.totals.nfcDevices}</span>
                    </div>
                  </CardBody>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                  <CardBody className="p-5 flex flex-col justify-between h-32">
                    <span className="text-[11.5px] font-extrabold tracking-wider text-muted uppercase">MRR / ARR</span>
                    <div>
                      <div className="text-[28px] font-extrabold leading-none tracking-tight">${kpi.totals.mrr}</div>
                      <span className="text-[10px] text-muted mt-1.5 inline-block">ARR: ${kpi.totals.arr}</span>
                    </div>
                  </CardBody>
                </Card>
              </div>

              {/* Real platform composition + revenue/storage */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                  <CardHeader className="border-b border-line px-6 py-4">
                    <span className="text-[13.5px] font-extrabold">Platform Composition</span>
                  </CardHeader>
                  <CardBody className="p-6">
                    {(() => {
                      const rows = [
                        { label: 'Users', value: kpi.totals.users, color: '#2563eb' },
                        { label: 'Organizations', value: kpi.totals.organizations, color: '#4f46e5' },
                        { label: 'Cards', value: kpi.totals.cards, color: '#0ea5e9' },
                        { label: 'Published Cards', value: kpi.totals.publishedCards, color: '#10b981' },
                        { label: 'NFC Devices', value: kpi.totals.nfcDevices, color: '#ec4899' },
                        { label: 'CRM Leads', value: kpi.totals.leads, color: '#f59e0b' },
                      ];
                      const max = Math.max(1, ...rows.map((r) => r.value));
                      return (
                        <div className="space-y-3.5">
                          {rows.map((r) => (
                            <div key={r.label} className="flex items-center gap-3">
                              <span className="w-32 shrink-0 text-[12px] font-semibold text-muted">{r.label}</span>
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                                <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
                              </div>
                              <span className="w-12 shrink-0 text-end text-[12px] font-extrabold tabular-nums text-ink">{r.value}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader className="border-b border-line px-6 py-4">
                    <span className="text-[13.5px] font-extrabold text-ink">Revenue &amp; Storage</span>
                  </CardHeader>
                  <CardBody className="p-6 space-y-4 text-[12px]">
                    <div className="flex justify-between">
                      <span className="text-muted">Monthly recurring (MRR):</span>
                      <span className="font-extrabold text-ink">${kpi.totals.mrr}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Annual recurring (ARR):</span>
                      <span className="font-extrabold text-ink">${kpi.totals.arr}</span>
                    </div>
                    <div className="flex justify-between border-t border-line pt-4">
                      <span className="text-muted">Database size:</span>
                      <span className="font-extrabold text-ink">{kpi.totals.dbSize ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Total profile views:</span>
                      <span className="font-extrabold text-ink">{kpi.totals.profileViews}</span>
                    </div>
                    <div className="mt-2 flex items-start gap-2 rounded-lg border border-line bg-canvas/40 p-2.5 text-[11px] font-medium text-muted">
                      <Icon name="settings" size={13} className="mt-0.5 shrink-0" />
                      Live host telemetry (CPU / RAM / uptime) isn't wired to real metrics yet — shown only once a monitoring source is connected.
                    </div>
                  </CardBody>
                </Card>
              </div>

              {/* Extra KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-surface/50 border border-line">
                  <CardBody className="p-4 text-center">
                    <div className="text-[20px] font-black text-ink">{kpi.totals.leads}</div>
                    <span className="text-[11px] text-muted font-bold tracking-tight uppercase">CRM Leads Captured</span>
                  </CardBody>
                </Card>
                <Card className="bg-surface/50 border border-line">
                  <CardBody className="p-4 text-center">
                    <div className="text-[20px] font-black text-ink">{kpi.totals.profileViews}</div>
                    <span className="text-[11px] text-muted font-bold tracking-tight uppercase">Total Card Views</span>
                  </CardBody>
                </Card>
                <Card className="bg-surface/50 border border-line">
                  <CardBody className="p-4 text-center">
                    <div className="text-[20px] font-black text-ink">{kpi.totals.publishedCards}</div>
                    <span className="text-[11px] text-muted font-bold tracking-tight uppercase">Published Cards</span>
                  </CardBody>
                </Card>
                <Card className="bg-surface/50 border border-line">
                  <CardBody className="p-4 text-center">
                    <div className="text-[20px] font-black text-ink">{kpi.totals.profileViews}</div>
                    <span className="text-[11px] text-muted font-bold tracking-tight uppercase">Tracked Events</span>
                  </CardBody>
                </Card>
              </div>
            </div>
          )}

          {/* TAB 2: USER LIFECYCLE MANAGEMENT */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-between bg-surface p-4 rounded-xl border border-line">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <Input
                    placeholder="Search users by name or email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full sm:w-80"
                  />
                  <Select
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value as any)}
                    className="w-40"
                  >
                    <option value="ALL">All Users</option>
                    <option value="ACTIVE">Active Users</option>
                    <option value="SUSPENDED">Suspended Users</option>
                    <option value="ADMIN">Super Admins</option>
                  </Select>
                </div>
                <Button variant="primary" onClick={() => setCreateUserModalOpen(true)}>
                  + Create User Account
                </Button>
              </div>

              <Card>
                <CardBody className="p-0 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-line bg-surface/50 font-extrabold text-muted text-[11px] uppercase tracking-wider">
                        <th className="p-4">User Account</th>
                        <th className="p-4">Organizations & Roles</th>
                        <th className="p-4">Total Assets</th>
                        <th className="p-4">Created Date</th>
                        <th className="p-4">Privilege / Status</th>
                        <th className="p-4 text-right">Operational Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-muted">No users found matching query</td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => (
                          <tr key={u.id} className="border-b border-line hover:bg-surface/30">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <span className="h-8 w-8 rounded-full bg-blue-600/20 text-blue-600 flex items-center justify-center font-bold">
                                  {u.name?.charAt(0) ?? 'U'}
                                </span>
                                <div>
                                  <div className="font-extrabold text-ink">{u.name || 'Anonymous User'}</div>
                                  <span className="text-[11.5px] text-muted">{u.email}</span>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="space-y-1">
                                {u.organizations.map((org) => (
                                  <div key={org.id} className="flex items-center gap-1.5">
                                    <Badge variant={org.status === 'SUSPENDED' ? 'error' : 'info'} className="text-[9.5px]">
                                      {org.name} ({org.role})
                                    </Badge>
                                  </div>
                                ))}
                                {u.organizations.length === 0 && <span className="text-muted italic text-[11px]">No tenant membership</span>}
                              </div>
                            </td>
                            <td className="p-4">
                              <span className="font-bold text-ink">{u.cardsCount} cards</span>
                              <span className="text-muted text-[11px] block">{u.leadsCount} CRM leads</span>
                            </td>
                            <td className="p-4 text-muted">
                              {new Date(u.createdAt).toLocaleDateString()}
                            </td>
                            <td className="p-4">
                              <div className="space-y-1">
                                <Badge variant={u.isSuperAdmin ? 'error' : 'neutral'} className="text-[10px]">
                                  {u.isSuperAdmin ? 'Super Admin' : 'Standard User'}
                                </Badge>
                                {u.organizations.some(o => o.status === 'SUSPENDED') && (
                                  <span className="block text-[10px] text-red-500 font-extrabold">● ACCOUNT SUSPENDED</span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button size="sm" variant="outline" className="text-[11.5px]" onClick={() => handleImpersonateUser(u.id)}>
                                  Impersonate
                                </Button>
                                {u.organizations.some(o => o.status === 'ACTIVE') ? (
                                  <Button size="sm" variant="danger" className="text-[11.5px]" onClick={() => handleUpdateUserStatus(u.id, 'SUSPENDED')}>
                                    Suspend
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="outline" className="text-[11.5px]" onClick={() => handleUpdateUserStatus(u.id, 'ACTIVE')}>
                                    Activate
                                  </Button>
                                )}
                                <Button size="sm" variant="secondary" className="text-[11.5px]" onClick={() => handleToggleUserAdmin(u.id, u.isSuperAdmin)}>
                                  {u.isSuperAdmin ? 'Revoke Admin' : 'Grant Admin'}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            </div>
          )}

          {/* TAB 3: TENANT ORGANIZATIONS */}
          {activeTab === 'organizations' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-between bg-surface p-4 rounded-xl border border-line">
                <Input
                  placeholder="Search organizations by name or slug..."
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                  className="w-full sm:w-80"
                />
                <Button variant="primary" onClick={() => {
                  setCreateOrgStatus(null);
                  setCreateOrgModalOpen(true);
                }}>
                  + Create Organization
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredOrgs.map((o) => (
                  <Card key={o.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="border-b border-line px-6 py-4 flex items-center justify-between">
                      <div>
                        <div className="font-extrabold text-[15px] text-ink flex items-center gap-2">
                          {o.name}
                          <Badge variant={o.isActive ? 'success' : 'error'} className="text-[9px] px-1 py-0.5">
                            {o.isActive ? 'Active' : 'Suspended'}
                          </Badge>
                        </div>
                        <span className="text-[11px] text-muted">/{o.slug}</span>
                      </div>
                      <Badge variant={o.plan === 'FREE' ? 'neutral' : o.plan === 'PRO' ? 'info' : 'success'}>
                        {o.plan} Plan
                      </Badge>
                    </CardHeader>
                    <CardBody className="p-6 space-y-4 text-[12.5px]">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-muted">
                          <span>Owner account:</span>
                          <span className="font-bold text-ink">{o.owner ? o.owner.email : 'Unassigned'}</span>
                        </div>
                        <div className="flex justify-between text-muted">
                          <span>Members count:</span>
                          <span className="font-bold text-ink">{o.membersCount} users</span>
                        </div>
                        <div className="flex justify-between text-muted">
                          <span>Created Cards:</span>
                          <span className="font-bold text-ink">{o.cardsCount}</span>
                        </div>
                        <div className="flex justify-between text-muted">
                          <span>NFC / QR Tag stock:</span>
                          <span className="font-bold text-blue-600">{o.nfcCount} devices</span>
                        </div>
                        <div className="flex justify-between text-muted">
                          <span>CRM Leads captured:</span>
                          <span className="font-bold text-emerald-500">{o.leadsCount}</span>
                        </div>
                      </div>

                      <div className="border-t border-line pt-4 flex gap-2 justify-end items-center flex-wrap">
                        <Select
                          value={o.plan}
                          onChange={(e) => handleUpgradeOrg(o.id, e.target.value)}
                          className="text-[12px] h-8 py-0.5"
                        >
                          <option value="FREE">Upgrade to Free</option>
                          <option value="PRO">Upgrade to Pro</option>
                          <option value="BUSINESS">Upgrade to Business</option>
                          <option value="ENTERPRISE">Upgrade to Enterprise</option>
                        </Select>
                        <Button variant="secondary" size="sm" className="text-[11px] h-8" onClick={() => {
                          setChangeOwnerOrgId(o.id);
                          setChangeOwnerOrgName(o.name);
                          setChangeOwnerStatus(null);
                          setChangeOwnerModalOpen(true);
                        }}>
                          Change Owner
                        </Button>
                        <Button variant={o.isActive ? 'danger' : 'outline'} size="sm" className="text-[11px] h-8" onClick={() => handleToggleOrgStatus(o.id, o.isActive)}>
                          {o.isActive ? 'Suspend' : 'Activate'}
                        </Button>
                        <Button variant="danger" size="sm" className="text-[11px] h-8" onClick={() => {
                          setDeleteOrgId(o.id);
                          setDeleteOrgName(o.name);
                          setDeleteOrgModalOpen(true);
                        }}>
                          Delete
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: NFC & QR INVENTORY */}
          {activeTab === 'nfc-qr' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Batch Import Card */}
              <Card className="lg:col-span-1">
                <CardHeader className="border-b border-line px-6 py-4">
                  <span className="text-[13.5px] font-extrabold text-ink">Bulk Register NFC Hardware UIDs</span>
                </CardHeader>
                <CardBody className="p-6 space-y-4">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-muted mb-1.5">
                      Hardware type factor
                    </label>
                    <Select
                      value={nfcHardwareType}
                      onChange={(e) => setNfcHardwareType(e.target.value as any)}
                      className="w-full"
                    >
                      <option value="CARD">Physical NFC Card</option>
                      <option value="STICKER">NFC Sticker</option>
                      <option value="KEYCHAIN">NFC Keychain</option>
                      <option value="WRISTBAND">NFC Wristband</option>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-muted mb-1.5">
                      NFC Chip UIDs (1 per line)
                    </label>
                    <textarea
                      placeholder="04:DE:5F:AA:BB:CC:11&#10;04:DE:5F:AA:BB:CC:12&#10;04:DE:5F:AA:BB:CC:13"
                      value={nfcImportText}
                      onChange={(e) => setNfcImportText(e.target.value)}
                      rows={6}
                      className="w-full rounded-xl border border-line bg-canvas p-3.5 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  <Button variant="primary" className="w-full" onClick={handleImportNfcTags} disabled={actionLoading}>
                    Import Batch of Tags
                  </Button>
                </CardBody>
              </Card>

              {/* NFC Tags List */}
              <Card className="lg:col-span-2">
                <CardHeader className="border-b border-line px-6 py-4 flex items-center justify-between">
                  <span className="text-[13.5px] font-extrabold text-ink">NFC Stock Inventory</span>
                  <Badge variant="info">{kpi?.totals.nfcDevices} Total tags</Badge>
                </CardHeader>
                <CardBody className="p-0">
                  <div className="max-h-[420px] overflow-y-auto">
                    <table className="w-full border-collapse text-left text-[12px]">
                      <thead>
                        <tr className="border-b border-line bg-surface/50 font-extrabold text-muted text-[10px] uppercase tracking-wider">
                          <th className="p-3">UID</th>
                          <th className="p-3">Device Model</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Scans</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orgs.flatMap(o => o.slug === 'demo' ? [
                          { uid: '04:AA:BB:CC:DD:EE:11', status: 'ACTIVE', type: 'CARD', count: 12 },
                          { uid: '04:AA:BB:CC:DD:EE:12', status: 'UNASSIGNED', type: 'STICKER', count: 0 },
                          { uid: '04:AA:BB:CC:DD:EE:13', status: 'DISABLED', type: 'KEYCHAIN', count: 3 }
                        ] : []).map((t, idx) => (
                          <tr key={idx} className="border-b border-line hover:bg-surface/30">
                            <td className="p-3 font-mono text-ink">{t.uid}</td>
                            <td className="p-3">
                              <Badge variant="neutral" className="text-[9px]">{t.type}</Badge>
                            </td>
                            <td className="p-3">
                              <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                                t.status === 'ACTIVE' ? 'text-emerald-500' : t.status === 'DISABLED' ? 'text-red-500' : 'text-amber-500'
                              }`}>
                                ● {t.status}
                              </span>
                            </td>
                            <td className="p-3 font-bold text-ink">{t.count} scans</td>
                            <td className="p-3 text-right">
                              <Button size="sm" variant="outline" className="text-[10px] px-2 py-1" onClick={() => alert('Status update trigger')}>
                                Toggle state
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            </div>
          )}

          {/* TAB 5: BACKGROUND QUEUES */}
          {activeTab === 'jobs' && (
            <div className="space-y-6">
              {/* Controls bar */}
              <div className="flex justify-between items-center bg-surface p-4 rounded-xl border border-line">
                <div className="flex gap-2">
                  <Button variant="outline" className="text-[12px]" onClick={() => alert('Worker scale options')}>
                    Scale Worker Pool
                  </Button>
                  <Button variant="danger" className="text-[12px]" onClick={() => alert('Queue cleared')}>
                    Purge Queues
                  </Button>
                </div>
                <Badge variant="success" className="text-[11px] animate-pulse">● 4 Workers Connected</Badge>
              </div>

              {/* Jobs table */}
              <Card>
                <CardHeader className="border-b border-line px-6 py-4">
                  <span className="text-[13.5px] font-extrabold text-ink">Active Background Jobs Queue</span>
                </CardHeader>
                <CardBody className="p-0">
                  <table className="w-full border-collapse text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-line bg-surface/50 font-extrabold text-muted text-[11px] uppercase tracking-wider">
                        <th className="p-4">Job Details</th>
                        <th className="p-4">Execution Status</th>
                        <th className="p-4">Progress</th>
                        <th className="p-4">Assigned Worker</th>
                        <th className="p-4">Start Time</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job) => (
                        <tr key={job.id} className="border-b border-line hover:bg-surface/30">
                          <td className="p-4">
                            <div className="font-bold text-ink">{job.name}</div>
                            <span className="text-[11px] font-mono text-muted">{job.id}</span>
                            {job.error && <span className="block text-[11px] text-red-500 font-medium mt-1">{job.error}</span>}
                          </td>
                          <td className="p-4">
                            <Badge variant={
                              job.status === 'RUNNING' ? 'info' :
                              job.status === 'COMPLETED' ? 'success' :
                              job.status === 'FAILED' ? 'error' : 'neutral'
                            } className="text-[9.5px]">
                              {job.status}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <div className="w-32 space-y-1">
                              <ProgressBar value={job.progress} color={job.status === 'FAILED' ? 'var(--v-danger)' : 'var(--v-accent)'} />
                              <span className="text-[10px] text-muted block text-right">{job.progress}%</span>
                            </div>
                          </td>
                          <td className="p-4 text-muted">{job.worker}</td>
                          <td className="p-4 text-muted">{new Date(job.startedAt).toLocaleTimeString()}</td>
                          <td className="p-4 text-right">
                            <div className="flex gap-2 justify-end">
                              {job.status === 'FAILED' && (
                                <Button size="sm" variant="outline" className="text-[11px]" onClick={() => handleJobAction(job.id, 'RETRY')}>
                                  Retry
                                </Button>
                              )}
                              {job.status === 'RUNNING' && (
                                <>
                                  <Button size="sm" variant="secondary" className="text-[11px]" onClick={() => handleJobAction(job.id, 'PAUSE')}>
                                    Pause
                                  </Button>
                                  <Button size="sm" variant="danger" className="text-[11px]" onClick={() => handleJobAction(job.id, 'CANCEL')}>
                                    Cancel
                                  </Button>
                                </>
                              )}
                              {job.status === 'QUEUED' && (
                                <Button size="sm" variant="primary" className="text-[11px]" onClick={() => handleJobAction(job.id, 'RESUME')}>
                                  Start
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            </div>
          )}

          {/* TAB 6: FEATURE FLAGS */}
          {activeTab === 'flags' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Left Form */}
              <Card>
                <CardHeader className="border-b border-line px-6 py-4">
                  <span className="text-[13.5px] font-extrabold text-ink">Register Dynamic Feature Flag</span>
                </CardHeader>
                <CardBody className="p-6 space-y-4">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-muted mb-1.5">Flag Name / Key</label>
                    <Input placeholder="AI_LEAD_CHATBOT_MIGRATION" className="w-full" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-muted mb-1.5">Target Audience</label>
                    <Select className="w-full">
                      <option>All Platforms</option>
                      <option>Beta Program Opt-ins</option>
                      <option>Enterprise Plans Only</option>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-muted mb-1.5">Rollout Percentage</label>
                    <Input type="number" defaultValue={100} className="w-full" />
                  </div>
                  <Button variant="primary" className="w-full" onClick={() => alert('New feature flag added.')}>
                    Deploy Flag to Beta
                  </Button>
                </CardBody>
              </Card>

              {/* Right list */}
              <Card className="xl:col-span-2">
                <CardHeader className="border-b border-line px-6 py-4">
                  <span className="text-[13.5px] font-extrabold text-ink">Feature Gate Configurations</span>
                </CardHeader>
                <CardBody className="p-0">
                  <table className="w-full border-collapse text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-line bg-surface/50 font-extrabold text-muted text-[11px] uppercase tracking-wider">
                        <th className="p-4">Feature Key</th>
                        <th className="p-4">Audience rule</th>
                        <th className="p-4">Rollout</th>
                        <th className="p-4">Gate State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flags.map((flag) => (
                        <tr key={flag.id} className="border-b border-line hover:bg-surface/30">
                          <td className="p-4 font-bold text-ink">{flag.name}</td>
                          <td className="p-4 text-muted">{flag.targeting}</td>
                          <td className="p-4">
                            <span className="font-extrabold text-blue-600">{flag.rollout}% rollout</span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <Switch checked={flag.status} onChange={() => handleToggleFlag(flag.id)} />
                              <span className={`text-[12px] font-bold ${flag.status ? 'text-emerald-500' : 'text-red-500'}`}>
                                {flag.status ? 'ENABLED' : 'DISABLED'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            </div>
          )}

          {/* TAB 7: FIREWALL & SECURITY */}
          {activeTab === 'security' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Block IP Form */}
              <Card>
                <CardHeader className="border-b border-line px-6 py-4">
                  <span className="text-[13.5px] font-extrabold text-ink">Add Blocked IP Address</span>
                </CardHeader>
                <CardBody className="p-6">
                  <form onSubmit={handleBlockIP} className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-muted mb-1.5">IP / Subnet</label>
                      <Input
                        placeholder="203.0.113.12"
                        value={newBlockedIP}
                        onChange={(e) => setNewBlockedIP(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <Button variant="danger" type="submit" className="w-full">
                      Block IP Address
                    </Button>
                  </form>
                </CardBody>
              </Card>

              {/* Blocked IPs Table */}
              <Card className="lg:col-span-2">
                <CardHeader className="border-b border-line px-6 py-4 flex items-center justify-between">
                  <span className="text-[13.5px] font-extrabold text-ink">Platform Firewall Block List</span>
                  <Badge variant="error">{blockedIPs.length} Blocked IPs</Badge>
                </CardHeader>
                <CardBody className="p-0">
                  <table className="w-full border-collapse text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-line bg-surface/50 font-extrabold text-muted text-[11px] uppercase tracking-wider">
                        <th className="p-4">Blocked IP</th>
                        <th className="p-4">Reason</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blockedIPs.map((ip) => (
                        <tr key={ip} className="border-b border-line hover:bg-surface/30">
                          <td className="p-4 font-mono text-ink">{ip}</td>
                          <td className="p-4 text-muted">Failed sign-in pattern matching / spam prevention</td>
                          <td className="p-4 text-right">
                            <Button size="sm" variant="outline" className="text-[11px]" onClick={() => handleUnblockIP(ip)}>
                              Unblock
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            </div>
          )}

          {/* TAB 8: PLATFORM AUDIT LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="bg-surface p-4 rounded-xl border border-line flex items-center justify-between">
                <Input
                  placeholder="Filter logs by action key..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="w-full max-w-sm"
                />
                <Button variant="outline" size="sm" onClick={() => alert('Audit logs csv export triggered.')}>
                  Export to CSV
                </Button>
              </div>

              <Card>
                <CardBody className="p-0 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-[12.5px]">
                    <thead>
                      <tr className="border-b border-line bg-surface/50 font-extrabold text-muted text-[10px] uppercase tracking-wider">
                        <th className="p-4">Timestamp</th>
                        <th className="p-4">Executor User</th>
                        <th className="p-4">Action</th>
                        <th className="p-4">Target Type</th>
                        <th className="p-4">Target ID</th>
                        <th className="p-4">Extra Metadata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((log) => (
                        <tr key={log.id} className="border-b border-line hover:bg-surface/30">
                          <td className="p-4 text-muted">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="p-4 font-bold text-ink">
                            {log.actor ? log.actor.email : 'System process'}
                          </td>
                          <td className="p-4">
                            <Badge variant={log.action.includes('SUSPEND') || log.action.includes('FAIL') ? 'error' : 'info'} className="text-[9.5px]">
                              {log.action}
                            </Badge>
                          </td>
                          <td className="p-4 text-muted">{log.targetType || 'N/A'}</td>
                          <td className="p-4 font-mono text-muted text-[11px]">{log.targetId || 'N/A'}</td>
                          <td className="p-4">
                            <span className="font-mono text-[10px] text-muted truncate max-w-[200px] block">
                              {JSON.stringify(log.metadata)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            </div>
          )}

          {/* TAB 9: DEVELOPER CONSOLE */}
          {activeTab === 'developer' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="border-b border-line px-6 py-4">
                  <span className="text-[13.5px] font-extrabold text-ink">Environment Variables (Masked)</span>
                </CardHeader>
                <CardBody className="p-6 space-y-3.5 text-[12.5px]">
                  <div className="flex justify-between border-b border-line pb-2">
                    <span className="font-bold font-mono">DATABASE_URL</span>
                    <span className="text-muted font-mono">postgresql://********:********@localhost:5432/vertex_connect</span>
                  </div>
                  <div className="flex justify-between border-b border-line pb-2">
                    <span className="font-bold font-mono">JWT_SECRET</span>
                    <span className="text-muted font-mono">****************************************</span>
                  </div>
                  <div className="flex justify-between border-b border-line pb-2">
                    <span className="font-bold font-mono">STRIPE_SECRET_KEY</span>
                    <span className="text-muted font-mono">sk_test_****************************************</span>
                  </div>
                  <div className="flex justify-between pb-2">
                    <span className="font-bold font-mono">APP_PUBLIC_URL</span>
                    <span className="text-blue-600 font-mono">http://localhost:3000</span>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader className="border-b border-line px-6 py-4">
                  <span className="text-[13.5px] font-extrabold text-ink">System Maintenance Toggles</span>
                </CardHeader>
                <CardBody className="p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-bold text-ink">Platform Maintenance Mode</div>
                      <span className="text-[11px] text-muted block">Forces 503 Service Unavailable for standard tenants</span>
                    </div>
                    <Switch checked={false} onChange={() => alert('Maintenance Mode toggled')} />
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-bold text-ink">Restrict Sign Ups</div>
                      <span className="text-[11px] text-muted block">Bans new organization registration requests</span>
                    </div>
                    <Switch checked={false} onChange={() => alert('Sign-ups lock toggled')} />
                  </div>
                </CardBody>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Global Command Palette Dialog */}
      {commandPaletteOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-line flex items-center gap-3">
              <Icon name="gauge" size={16} className="text-muted" />
              <input
                type="text"
                placeholder="Type a command or navigate..."
                value={commandSearch}
                onChange={(e) => setCommandSearch(e.target.value)}
                autoFocus
                className="w-full bg-transparent text-[14px] text-ink focus:outline-none placeholder-muted"
              />
              <button
                className="text-muted hover:text-ink text-[11px] font-mono border border-line bg-canvas px-1.5 py-0.5 rounded-lg"
                onClick={() => setCommandPaletteOpen(false)}
              >
                ESC
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-2 space-y-1">
              {filteredCommands.length === 0 ? (
                <div className="p-4 text-center text-muted text-[13px]">No matching command found</div>
              ) : (
                filteredCommands.map((cmd, idx) => (
                  <div
                    key={idx}
                    onClick={cmd.action}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-canvas text-[13px] text-ink font-bold cursor-pointer transition-colors"
                  >
                    <span>{cmd.label}</span>
                    <span className="text-[10px] text-muted">Press Enter</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* Create User Account Dialog */}
      {createUserModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-line flex items-center justify-between">
              <h2 className="text-[16px] font-black text-ink">Create New User Account</h2>
              <button onClick={() => setCreateUserModalOpen(false)} className="text-muted hover:text-ink">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                  Email Address
                </label>
                <Input
                  type="email"
                  required
                  placeholder="user@organization.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                  Full Name
                </label>
                <Input
                  placeholder="Jane Doe"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                  Initial Password
                </label>
                <Input
                  type="password"
                  placeholder="Password123! (Defaults to this if empty)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                  Create Organization Workspace
                </label>
                <Input
                  required
                  placeholder="Acme Org"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex items-center justify-between border-t border-line/60 pt-4">
                <div>
                  <div className="text-[12.5px] font-bold text-ink">Grant Super Admin access</div>
                  <span className="text-[10px] text-muted block">Gives global read/write administrative access</span>
                </div>
                <Switch checked={newIsSuperAdmin} onChange={() => setNewIsSuperAdmin(!newIsSuperAdmin)} />
              </div>
              <div className="flex gap-3 justify-end pt-4 border-t border-line/60">
                <Button variant="secondary" type="button" onClick={() => setCreateUserModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={actionLoading}>
                  Create User
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Create Organization Dialog */}
      {createOrgModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-line flex items-center justify-between">
              <h2 className="text-[16px] font-black text-ink">Create New Organization</h2>
              <button onClick={() => setCreateOrgModalOpen(false)} className="text-muted hover:text-ink">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateOrganization} className="p-6 space-y-4">
              {createOrgStatus && (
                <Alert
                  variant={createOrgStatus.type}
                  title={createOrgStatus.type === 'success' ? 'Success' : 'Error'}
                  onClose={() => setCreateOrgStatus(null)}
                >
                  {createOrgStatus.message}
                </Alert>
              )}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                  Organization Name
                </label>
                <Input
                  required
                  placeholder="Acme Corp"
                  value={newOrganizationName}
                  onChange={(e) => setNewOrganizationName(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                  Tier / Plan
                </label>
                <Select
                  value={newOrgPlan}
                  onChange={(e) => setNewOrgPlan(e.target.value as any)}
                  className="w-full"
                >
                  <option value="FREE">Free Tier</option>
                  <option value="PRO">Pro Tier</option>
                  <option value="BUSINESS">Business Tier</option>
                  <option value="ENTERPRISE">Enterprise Tier</option>
                </Select>
              </div>

              <div className="border-t border-line/60 pt-4">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                  Owner Assignment
                </label>
                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                    <input
                      type="radio"
                      name="ownerOption"
                      checked={ownerOption === 'existing'}
                      onChange={() => setOwnerOption('existing')}
                    />
                    Existing User Account
                  </label>
                  <label className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                    <input
                      type="radio"
                      name="ownerOption"
                      checked={ownerOption === 'new'}
                      onChange={() => setOwnerOption('new')}
                    />
                    Create New User Account
                  </label>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                      Owner Email Address
                    </label>
                    <Input
                      type="email"
                      required
                      placeholder="owner@acme.com"
                      value={newOrgOwnerEmail}
                      onChange={(e) => setNewOrgOwnerEmail(e.target.value)}
                      className="w-full"
                    />
                  </div>

                  {ownerOption === 'new' && (
                    <>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                          Owner Full Name
                        </label>
                        <Input
                          placeholder="John Acme"
                          value={newOrgOwnerName}
                          onChange={(e) => setNewOrgOwnerName(e.target.value)}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                          Owner Password
                        </label>
                        <Input
                          type="password"
                          placeholder="Password123! (Defaults to this if empty)"
                          value={newOrgOwnerPassword}
                          onChange={(e) => setNewOrgOwnerPassword(e.target.value)}
                          className="w-full"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-line/60">
                <Button variant="secondary" type="button" onClick={() => setCreateOrgModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={actionLoading}>
                  Create Organization
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Organization Owner Dialog */}
      {changeOwnerModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-line flex items-center justify-between">
              <div>
                <h2 className="text-[16px] font-black text-ink">Change Organization Owner</h2>
                <span className="text-[11px] text-muted block">Organization: {changeOwnerOrgName}</span>
              </div>
              <button onClick={() => setChangeOwnerModalOpen(false)} className="text-muted hover:text-ink">
                ✕
              </button>
            </div>
            <form onSubmit={handleChangeOrgOwner} className="p-6 space-y-4">
              {changeOwnerStatus && (
                <Alert
                  variant={changeOwnerStatus.type}
                  title={changeOwnerStatus.type === 'success' ? 'Success' : 'Error'}
                  onClose={() => setChangeOwnerStatus(null)}
                >
                  {changeOwnerStatus.message}
                </Alert>
              )}
              <div className="text-[12px] text-muted rounded-xl bg-canvas p-3.5 border border-line">
                Provide the email address of the account that will become the primary manager/OWNER of this organization. If this email does not match an existing user account, a new user account will be created automatically.
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                  Manager Email Address
                </label>
                <Input
                  type="email"
                  required
                  placeholder="manager@acme.com"
                  value={changeOwnerEmail}
                  onChange={(e) => setChangeOwnerEmail(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                  Manager Full Name (For new accounts only)
                </label>
                <Input
                  placeholder="John Acme"
                  value={changeOwnerName}
                  onChange={(e) => setChangeOwnerName(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                  Password (For new accounts only)
                </label>
                <Input
                  type="password"
                  placeholder="Password123! (Defaults to this if empty)"
                  value={changeOwnerPassword}
                  onChange={(e) => setChangeOwnerPassword(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-line/60">
                <Button variant="secondary" type="button" onClick={() => setChangeOwnerModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={actionLoading}>
                  Update Owner
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Organization Confirmation Dialog */}
      {deleteOrgModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-line flex items-center justify-between">
              <h2 className="text-[16px] font-black text-ink">Delete Organization</h2>
              <button onClick={() => setDeleteOrgModalOpen(false)} className="text-muted hover:text-ink">
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[13.5px] text-muted leading-relaxed">
                Are you sure you want to delete <span className="font-extrabold text-ink">{deleteOrgName}</span>? All of its data (members, cards, NFC tags, CRM leads) will be preserved in the database but soft-deleted. This organization will be immediately disabled for all standard users.
              </p>
              <div className="flex gap-3 justify-end pt-4 border-t border-line/60">
                <Button variant="secondary" type="button" onClick={() => setDeleteOrgModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="danger" type="button" onClick={handleDeleteOrganization} disabled={actionLoading}>
                  Delete Organization
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
