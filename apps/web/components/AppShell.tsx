'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { authFetch, logout, getActiveOrgId, setActiveOrgId, type Me } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { PROFILE_UPDATED } from '@/components/ProfilePhotoCard';
import { NotificationBell } from '@/components/NotificationBell';
import { VMark } from '@/components/brand/VMark';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

// Labels are i18n keys (nav namespace), resolved at render time so the sidebar
// re-localizes instantly when the language changes.
const GROUPS: { labelKey: string; items: { href: string; labelKey: string; icon: string }[] }[] = [
  {
    labelKey: 'groups.overview',
    items: [
      { href: '/dashboard', labelKey: 'items.dashboard', icon: 'gauge' },
      { href: '/analytics', labelKey: 'items.analytics', icon: 'chart-bar' },
    ],
  },
  {
    labelKey: 'groups.workspace',
    items: [
      { href: '/cards', labelKey: 'items.cards', icon: 'grid' },
      { href: '/leads', labelKey: 'items.leads', icon: 'inbox' },
      { href: '/tags', labelKey: 'items.tags', icon: 'tag' },
    ],
  },
  {
    labelKey: 'groups.organization',
    items: [
      { href: '/team', labelKey: 'items.team', icon: 'users' },
      { href: '/integrations', labelKey: 'items.integrations', icon: 'layers' },
    ],
  },
];

type Theme = 'light' | 'dark';

export default function AppShell({
  title,
  action,
  children,
  fluid = false,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  fluid?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation('nav');
  const [theme, setTheme] = useState<Theme>('light');
  const [me, setMe] = useState<Me | null>(null);

  // Switcher State
  const [orgs, setOrgs] = useState<{ org: { id: string; name: string; slug: string }; role: string }[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherSearch, setSwitcherSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [switcherIndex, setSwitcherIndex] = useState(0);

  // Global Search State
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchData, setSearchData] = useState<{
    cards: any[];
    teams: any[];
    members: any[];
    departments: any[];
    leads: any[];
    tags: any[];
    assets: any[];
    notifications: any[];
  }>({
    cards: [],
    teams: [],
    members: [],
    departments: [],
    leads: [],
    tags: [],
    assets: [],
    notifications: [],
  });
  const [searchLoading, setSearchLoading] = useState(false);

  const switcherRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const globalSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedTheme = (localStorage.getItem('vertex_theme') as Theme) || 'light';
    setTheme(savedTheme);
    
    // Load favorites and recents from localStorage
    const savedFavs = JSON.parse(localStorage.getItem('vertex_favorites') || '[]');
    setFavorites(savedFavs);
    const savedRecents = JSON.parse(localStorage.getItem('vertex_recents') || '[]');
    setRecents(savedRecents);

    const activeId = getActiveOrgId();
    setSelectedOrgId(activeId);

    authFetch<Me>('/auth/me')
      .then(setMe)
      .catch(() => {});

    authFetch<any[]>('/orgs')
      .then((list) => {
        setOrgs(list);
        // If user has organization workspace but no active workspace set, auto-switch to first org
        if (!activeId && list.length > 0) {
          handleSwitchOrg(list[0].org.id);
        }
      })
      .catch(() => {});

    // Listen to click outside switcher
    const clickOutside = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
      if (globalSearchRef.current && !globalSearchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', clickOutside);

    // Keyboard shortcut for search (Ctrl+K)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Keep the sidebar identity in step when the user edits their profile.
    const onProfile = (e: Event) => setMe((e as CustomEvent<Me>).detail);
    window.addEventListener(PROFILE_UPDATED, onProfile);

    return () => {
      document.removeEventListener('mousedown', clickOutside);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener(PROFILE_UPDATED, onProfile);
    };
  }, []);

  const handleSwitchOrg = (id: string | null) => {
    setActiveOrgId(id);
    setSelectedOrgId(id);
    setSwitcherOpen(false);

    // Record in Recents
    const targetKey = id ? id : 'personal';
    let nextRecents = [targetKey, ...recents.filter((r) => r !== targetKey)];
    nextRecents = nextRecents.slice(0, 3);
    setRecents(nextRecents);
    localStorage.setItem('vertex_recents', JSON.stringify(nextRecents));

    window.location.reload();
  };

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const nextFavs = favorites.includes(id)
      ? favorites.filter((f) => f !== id)
      : [...favorites, id];
    setFavorites(nextFavs);
    localStorage.setItem('vertex_favorites', JSON.stringify(nextFavs));
  };

  // Switcher Items filtering
  const allWorkspaceItems = useMemo(() => [
    { id: 'personal', name: 'Personal Workspace', isOrg: false, slug: 'personal' },
    ...orgs.map((o) => ({ id: o.org.id, name: o.org.name, isOrg: true, slug: o.org.slug })),
  ], [orgs]);

  const filteredItems = useMemo(() => allWorkspaceItems.filter((item) =>
    item.name.toLowerCase().includes(switcherSearch.toLowerCase())
  ), [allWorkspaceItems, switcherSearch]);

  const visibleSwitcherItems = useMemo(() => {
    const list: { id: string; name: string; isOrg: boolean; slug: string; type: 'fav' | 'recent' | 'all' }[] = [];
    if (switcherSearch === '') {
      // Add Favorites
      allWorkspaceItems
        .filter((item) => favorites.includes(item.id))
        .forEach((item) => list.push({ ...item, type: 'fav' }));

      // Add Recents
      allWorkspaceItems
        .filter((item) => recents.includes(item.id) && !favorites.includes(item.id))
        .forEach((item) => list.push({ ...item, type: 'recent' }));
    }
    // Add Workspaces list
    filteredItems.forEach((item) => {
      if (switcherSearch !== '' || (!favorites.includes(item.id) && !recents.includes(item.id))) {
        list.push({ ...item, type: 'all' });
      }
    });
    return list;
  }, [allWorkspaceItems, filteredItems, favorites, recents, switcherSearch]);

  // Switcher Keyboard navigation
  const handleSwitcherKeyDown = (e: React.KeyboardEvent) => {
    if (!switcherOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSwitcherIndex((prev) => (prev + 1) % visibleSwitcherItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSwitcherIndex((prev) => (prev - 1 + visibleSwitcherItems.length) % visibleSwitcherItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visibleSwitcherItems[switcherIndex]) {
        const item = visibleSwitcherItems[switcherIndex];
        handleSwitchOrg(item.isOrg ? item.id : null);
      }
    } else if (e.key === 'Escape') {
      setSwitcherOpen(false);
    }
  };

  // Lazy load Global Search index
  const handleSearchFocus = async () => {
    setSearchOpen(true);
    if (searchLoading || searchData.cards.length > 0) return;
    setSearchLoading(true);
    try {
      const [crd, tm, mem, dept, lds, nfc, ast, ntf] = await Promise.all([
        authFetch<any[]>('/cards').catch(() => []),
        selectedOrgId ? authFetch<any[]>('/orgs/teams').catch(() => []) : Promise.resolve([]),
        selectedOrgId ? authFetch<any[]>('/orgs/members').catch(() => []) : Promise.resolve([]),
        selectedOrgId ? authFetch<any[]>('/orgs/departments').catch(() => []) : Promise.resolve([]),
        authFetch<any[]>('/leads').catch(() => []),
        authFetch<any[]>('/nfc/tags').catch(() => []),
        selectedOrgId ? authFetch<any[]>('/orgs/assets').catch(() => []) : Promise.resolve([]),
        authFetch<any[]>('/notifications').catch(() => []),
      ]);
      setSearchData({
        cards: crd,
        teams: tm,
        members: mem,
        departments: dept,
        leads: lds,
        tags: nfc,
        assets: ast,
        notifications: ntf,
      });
    } catch {} finally {
      setSearchLoading(false);
    }
  };

  const getFilteredSearch = () => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return { cards: [], teams: [], members: [], departments: [], leads: [], tags: [], assets: [], notifications: [] };

    return {
      cards: searchData.cards.filter((c) =>
        ((c.vcardData?.fullName as string) ?? '').toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
      ),
      teams: searchData.teams.filter((t) => t.name.toLowerCase().includes(q)),
      members: searchData.members.filter((m) =>
        (m.user?.name ?? '').toLowerCase().includes(q) || m.user?.email.toLowerCase().includes(q)
      ),
      departments: searchData.departments.filter((d) => d.name.toLowerCase().includes(q)),
      leads: searchData.leads.filter((l) =>
        (l.name ?? '').toLowerCase().includes(q) ||
        (l.company ?? '').toLowerCase().includes(q) ||
        (l.email ?? '').toLowerCase().includes(q) ||
        (l.phone ?? '').toLowerCase().includes(q)
      ),
      tags: searchData.tags.filter((t) =>
        t.uid.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        (t.hardwareType ?? '').toLowerCase().includes(q)
      ),
      assets: searchData.assets.filter((a) =>
        a.name.toLowerCase().includes(q)
      ),
      notifications: searchData.notifications.filter((n) =>
        n.title.toLowerCase().includes(q) ||
        (n.body ?? '').toLowerCase().includes(q)
      ),
    };
  };

  const activeOrgName = selectedOrgId
    ? orgs.find((o) => o.org.id === selectedOrgId)?.org.name ?? 'Organization Workspace'
    : 'Personal Workspace';

  const totalWorkspacesCount = allWorkspaceItems.length;

  function toggleTheme() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('vertex_theme', next);
  }

  function signOut() {
    logout();
    window.location.href = '/login';
  }

  const searchResults = getFilteredSearch();
  const hasSearchResults = searchQuery && (
    searchResults.cards.length > 0 || 
    searchResults.teams.length > 0 || 
    searchResults.members.length > 0 ||
    searchResults.departments.length > 0 ||
    searchResults.leads.length > 0 ||
    searchResults.tags.length > 0 ||
    searchResults.assets.length > 0 ||
    searchResults.notifications.length > 0
  );

  return (
    <div
      data-theme={theme}
      style={{ '--v-accent': '#2563eb', '--v-accent-contrast': '#ffffff' } as React.CSSProperties}
      className="min-h-screen bg-canvas text-ink antialiased"
    >
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-[260px] flex-col border-e border-line bg-surface md:flex">
        <Link href="/dashboard" className="flex items-center gap-3 px-6 pb-4 pt-6">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-[12px] text-white shadow-md transition-transform hover:scale-105"
            style={{ background: 'linear-gradient(135deg, var(--v-accent), #1d4ed8)' }}
          >
            <VMark size={16} strokeWidth={3} />
          </span>
          <span className="v-display text-[16px] font-extrabold tracking-tight bg-gradient-to-r from-ink to-ink/80 bg-clip-text text-transparent">
            Vertex Connect
          </span>
        </Link>

        {/* Workspace Switcher dropdown */}
        <div ref={switcherRef} className="px-4 mb-4 relative z-40">
          <div
            onClick={() => setSwitcherOpen(!switcherOpen)}
            className="flex items-center justify-between gap-2 rounded-xl border border-line bg-canvas/40 p-2.5 hover:bg-canvas/80 transition-all select-none cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-6 w-6 rounded-lg text-[10px] font-black text-white flex items-center justify-center shrink-0"
                style={{
                  background: selectedOrgId
                    ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                    : 'linear-gradient(135deg, #10b981, #059669)',
                }}
              >
                {selectedOrgId ? activeOrgName.slice(0, 2).toUpperCase() : 'PS'}
              </span>
              <span className="text-[12.5px] font-bold text-ink truncate">
                {selectedOrgId ? '🏢 ' + activeOrgName : '👤 ' + activeOrgName}
              </span>
            </div>
            <span className="text-muted"><Icon name="chevron-down" size={12} /></span>
          </div>

          {switcherOpen && (
            <div className="absolute top-[48px] inset-x-4 mt-1 bg-surface border border-line rounded-2xl shadow-2xl p-2.5 space-y-2.5 z-50 text-left">
              {totalWorkspacesCount <= 1 ? (
                <div className="p-3 text-center text-xs font-semibold text-muted bg-canvas/40 border border-line rounded-xl">
                  ⚠️ Switching disabled. No other workspaces registered on your account.
                </div>
              ) : (
                <>
                  {/* Dropdown Search */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={t('searchWorkspace')}
                      value={switcherSearch}
                      onChange={(e) => {
                        setSwitcherSearch(e.target.value);
                        setSwitcherIndex(0);
                      }}
                      onKeyDown={handleSwitcherKeyDown}
                      className="w-full pl-8 pr-3 py-1.5 border border-line rounded-xl bg-canvas text-xs focus:outline-none focus:border-accent"
                      autoFocus
                    />
                    <span className="absolute left-2.5 top-2 text-muted">
                      <Icon name="search" size={12} />
                    </span>
                  </div>

                  {/* Items List */}
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto no-scrollbar">
                    {/* Favorites Section */}
                    {favorites.length > 0 && switcherSearch === '' && (
                      <div className="pb-1 border-b border-line/60">
                        <p className="px-2 text-[9px] font-bold uppercase tracking-wider text-faint mb-1">Favorites</p>
                        {allWorkspaceItems
                          .filter((item) => favorites.includes(item.id))
                          .map((item) => {
                            const isHighlighted = visibleSwitcherItems[switcherIndex]?.id === item.id && visibleSwitcherItems[switcherIndex]?.type === 'fav';
                            return (
                              <button
                                key={`fav-${item.id}`}
                                onClick={() => handleSwitchOrg(item.isOrg ? item.id : null)}
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-canvas/60 text-ink flex items-center justify-between transition-colors ${
                                  isHighlighted ? 'bg-canvas text-ink ring-1 ring-accent/20' : ''
                                }`}
                              >
                                <span className="flex items-center gap-2 truncate">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                  {item.isOrg ? '🏢 ' + item.name : '👤 ' + item.name}
                                </span>
                                <span
                                  onClick={(e) => toggleFavorite(item.id, e)}
                                  className="text-amber-500 hover:text-muted p-1"
                                >
                                  ★
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    )}

                    {/* Recents Section */}
                    {recents.length > 0 && switcherSearch === '' && (
                      <div className="pb-1 border-b border-line/60">
                        <p className="px-2 text-[9px] font-bold uppercase tracking-wider text-faint mb-1">Recents</p>
                        {allWorkspaceItems
                          .filter((item) => recents.includes(item.id))
                          .map((item) => {
                            const isHighlighted = visibleSwitcherItems[switcherIndex]?.id === item.id && visibleSwitcherItems[switcherIndex]?.type === 'recent';
                            return (
                              <button
                                key={`rec-${item.id}`}
                                onClick={() => handleSwitchOrg(item.isOrg ? item.id : null)}
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-canvas/60 text-ink flex items-center gap-2 transition-colors ${
                                  isHighlighted ? 'bg-canvas text-ink ring-1 ring-accent/20' : ''
                                }`}
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                {item.isOrg ? '🏢 ' + item.name : '👤 ' + item.name}
                              </button>
                            );
                          })}
                      </div>
                    )}

                    {/* All Workspaces */}
                    <div>
                      <p className="px-2 text-[9px] font-bold uppercase tracking-wider text-faint mb-1">Workspaces</p>
                      {filteredItems.map((item) => {
                        const active = selectedOrgId === (item.isOrg ? item.id : null);
                        const isFav = favorites.includes(item.id);
                        const isHighlighted = visibleSwitcherItems[switcherIndex]?.id === item.id && visibleSwitcherItems[switcherIndex]?.type === 'all';

                        return (
                          <div
                            key={item.id}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-between group ${
                              active
                                ? 'bg-accent/10 text-accent'
                                : isHighlighted
                                ? 'bg-canvas text-ink'
                                : 'text-muted hover:bg-canvas/40 hover:text-ink'
                            }`}
                            onClick={() => handleSwitchOrg(item.isOrg ? item.id : null)}
                            style={{ cursor: 'pointer' }}
                          >
                            <span className="flex items-center gap-2 truncate">
                              <span
                                className="h-4.5 w-4.5 rounded text-[8px] font-black text-white flex items-center justify-center shrink-0"
                                style={{
                                  background: item.isOrg
                                    ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                                    : 'linear-gradient(135deg, #10b981, #059669)',
                                }}
                              >
                                {item.isOrg ? item.name.slice(0, 2).toUpperCase() : 'PS'}
                              </span>
                              <span className="truncate">{item.isOrg ? '🏢 ' + item.name : '👤 ' + item.name}</span>
                            </span>
                            <span
                              onClick={(e) => toggleFavorite(item.id, e)}
                              className={`text-xs p-1 ${isFav ? 'text-amber-500' : 'text-faint opacity-0 group-hover:opacity-100 hover:text-amber-500'}`}
                            >
                              {isFav ? '★' : '☆'}
                            </span>
                          </div>
                        );
                      })}
                      {filteredItems.length === 0 && (
                        <p className="text-[11px] text-faint text-center py-4">No results found</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
          {GROUPS.map((group) => (
            <div key={group.labelKey} className="space-y-1.5">
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
                {t(group.labelKey)}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="v-nav-item hover:translate-x-0.5"
                      data-active={active}
                    >
                      <span className={`transition-colors duration-200 ${active ? 'text-accent' : 'text-muted'}`}>
                        <Icon name={item.icon} size={17} />
                      </span>
                      <span className="font-semibold">{t(item.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {me?.isSuperAdmin && (
            <div className="space-y-1.5 pt-4 border-t border-line">
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-600">
                {t('groups.administration')}
              </p>
              <div className="space-y-0.5">
                <Link
                  href="/admin"
                  className="v-nav-item hover:translate-x-0.5 text-blue-600 hover:text-blue-700"
                  data-active={pathname.startsWith('/admin')}
                >
                  <span className={`transition-colors duration-200 ${pathname.startsWith('/admin') ? 'text-blue-600' : 'text-muted'}`}>
                    <Icon name="gauge" size={17} />
                  </span>
                  <span className="font-semibold">{t('items.adminConsole')}</span>
                </Link>
              </div>
            </div>
          )}
        </nav>

        {/* Bottom: language + theme + user */}
        <div className="border-t border-line p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="ps-1 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
              {t('common:language', 'Language')}
            </span>
            <LanguageSwitcher />
          </div>

          <button
            onClick={toggleTheme}
            className="v-nav-item w-full hover:bg-ink/5"
            aria-label={t('toggleTheme')}
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} />
            <span className="font-semibold">{theme === 'light' ? t('darkMode') : t('lightMode')}</span>
          </button>

          <div className="flex items-center gap-3 rounded-[var(--v-radius)] bg-canvas border border-line/60 p-2.5 shadow-sm">
            {me && <Avatar user={me} size={36} verified={me.verified} className="shadow-sm" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-bold text-ink">
                {me?.name || me?.email || '—'}
              </span>
              <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-muted">{me?.role?.toLowerCase() ?? 'member'}</span>
            </span>
            <button
              onClick={signOut}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-all duration-200 hover:bg-red-500/10 hover:text-red-500 active:scale-95"
              aria-label={t('signOut')}
              title={t('signOut')}
            >
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="v-glass sticky top-0 z-30 border-b border-line md:hidden">
        <div className="flex items-center justify-between px-5 py-3.5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] text-white shadow-sm" style={{ background: 'linear-gradient(135deg, var(--v-accent), #1d4ed8)' }}>
              <VMark size={14} strokeWidth={3} />
            </span>
            <span className="v-display text-[15px] font-extrabold tracking-tight">Vertex</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <NotificationBell />
            <LanguageSwitcher />
            <button onClick={toggleTheme} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-ink/5" aria-label={t('toggleTheme')}>
              <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} />
            </button>
            <button onClick={signOut} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-500/10 hover:text-red-500" aria-label={t('signOut')}>
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-2.5">
          {GROUPS.flatMap((g) => g.items).map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-bold transition-all duration-200"
                style={{
                  color: active ? 'var(--v-accent-contrast)' : 'hsl(var(--v-muted))',
                  background: active ? 'var(--v-accent)' : 'transparent',
                  boxShadow: active ? 'var(--v-shadow-sm)' : 'none',
                }}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Main */}
      <div className="md:ps-[260px]">
        {/* Unified Top Nav with Search & Action Buttons */}
        <header className="v-glass sticky top-0 z-20 hidden items-center justify-between gap-6 border-b border-line px-10 py-4.5 md:flex">
          {/* Header Title */}
          <h1 className="v-display text-[18px] font-extrabold tracking-tight text-ink flex-shrink-0">{title}</h1>

          {/* Center: Global Search Bar */}
          <div ref={globalSearchRef} className="relative max-w-sm flex-1">
            <span className="absolute inset-y-0 left-3 flex items-center text-muted">
              <Icon name="search" size={15} />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search workspaces, cards, teams... (Ctrl+K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={handleSearchFocus}
              className="w-full pl-9 pr-14 py-2 border border-line rounded-xl bg-canvas/30 text-xs placeholder:text-muted focus:outline-none focus:border-accent focus:bg-surface transition-all"
            />
            <span className="absolute right-3 top-2 px-1.5 py-0.5 rounded border border-line bg-canvas text-[9px] font-bold text-faint uppercase select-none pointer-events-none">
              Ctrl+K
            </span>

            {/* Instant Search Results Dropdown Overlay */}
            {searchOpen && searchQuery && (
              <div className="absolute top-[42px] left-0 w-[460px] bg-surface border border-line rounded-2xl shadow-2xl p-4 space-y-4 max-h-[420px] overflow-y-auto z-50 animate-in fade-in slide-in-from-top-1 duration-150 text-left">
                {searchLoading ? (
                  <p className="text-xs font-semibold text-muted text-center py-4">Loading search index...</p>
                ) : !hasSearchResults ? (
                  <div className="text-center py-4">
                    <p className="text-xs font-semibold text-muted">No results matching "{searchQuery}"</p>
                  </div>
                ) : (
                  <>
                    {/* Cards Results */}
                    {searchResults.cards.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase text-faint tracking-wider mb-2 flex items-center gap-1.5 border-b border-line pb-1">
                          <Icon name="grid" size={10} /> Cards
                        </p>
                        <div className="space-y-1.5">
                          {searchResults.cards.slice(0, 3).map((c: any) => (
                            <Link
                              key={c.id}
                              href={`/cards/${c.id}`}
                              onClick={() => setSearchOpen(false)}
                              className="flex items-center justify-between p-2 rounded-xl hover:bg-canvas text-xs font-bold text-ink"
                            >
                              <span className="truncate">💳 {c.vcardData?.fullName || c.slug}</span>
                              <span className="text-[10px] font-mono text-faint">/c/{c.slug}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Departments Results */}
                    {searchResults.departments && searchResults.departments.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase text-faint tracking-wider mb-2 flex items-center gap-1.5 border-b border-line pb-1">
                          <Icon name="layers" size={10} /> Departments
                        </p>
                        <div className="space-y-1.5">
                          {searchResults.departments.slice(0, 3).map((d: any) => (
                            <Link
                              key={d.id}
                              href={`/workspace/departments/${d.id}`}
                              onClick={() => setSearchOpen(false)}
                              className="flex items-center justify-between p-2 rounded-xl hover:bg-canvas text-xs font-bold text-ink"
                            >
                              <span className="truncate">🏢 {d.name}</span>
                              <span className="text-[10px] font-bold text-muted bg-canvas border border-line px-1.5 py-0.5 rounded">
                                {d._count?.teams ?? 0} teams
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Teams Results */}
                    {searchResults.teams.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase text-faint tracking-wider mb-2 flex items-center gap-1.5 border-b border-line pb-1">
                          <Icon name="users" size={10} /> Teams
                        </p>
                        <div className="space-y-1.5">
                          {searchResults.teams.slice(0, 3).map((t: any) => (
                            <Link
                              key={t.id}
                              href={`/workspace/teams/${t.id}`}
                              onClick={() => setSearchOpen(false)}
                              className="flex items-center justify-between p-2 rounded-xl hover:bg-canvas text-xs font-bold text-ink"
                            >
                              <span className="truncate">👥 {t.name}</span>
                              <span className="text-[10px] font-bold text-muted bg-canvas border border-line px-1.5 py-0.5 rounded">
                                {t._count?.memberships ?? 0} seats
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Members Results */}
                    {searchResults.members.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase text-faint tracking-wider mb-2 flex items-center gap-1.5 border-b border-line pb-1">
                          <Icon name="user" size={10} /> Members
                        </p>
                        <div className="space-y-1.5">
                          {searchResults.members.slice(0, 3).map((m: any) => (
                            <Link
                              key={m.id}
                              href="/team"
                              onClick={() => setSearchOpen(false)}
                              className="flex items-center justify-between p-2 rounded-xl hover:bg-canvas text-xs font-bold text-ink"
                            >
                              <span className="truncate">👤 {m.user?.name || 'Pending'}</span>
                              <span className="text-[10px] font-mono text-faint">{m.user?.email}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* CRM Leads Results */}
                    {searchResults.leads.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase text-faint tracking-wider mb-2 flex items-center gap-1.5 border-b border-line pb-1">
                          <Icon name="inbox" size={10} /> CRM Leads
                        </p>
                        <div className="space-y-1.5">
                          {searchResults.leads.slice(0, 3).map((l: any) => (
                            <Link
                              key={l.id}
                              href="/leads"
                              onClick={() => setSearchOpen(false)}
                              className="flex items-center justify-between p-2 rounded-xl hover:bg-canvas text-xs font-bold text-ink"
                            >
                              <span className="truncate">🎯 {l.name || 'Anonymous Lead'}</span>
                              <span className="text-[10px] text-faint truncate max-w-[120px]">{l.company || 'Direct'}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* NFC & QR Tag Results */}
                    {searchResults.tags.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase text-faint tracking-wider mb-2 flex items-center gap-1.5 border-b border-line pb-1">
                          <Icon name="tag" size={10} /> NFC & QR Devices
                        </p>
                        <div className="space-y-1.5">
                          {searchResults.tags.slice(0, 3).map((t: any) => (
                            <Link
                              key={t.id}
                              href="/tags"
                              onClick={() => setSearchOpen(false)}
                              className="flex items-center justify-between p-2 rounded-xl hover:bg-canvas text-xs font-bold text-ink"
                            >
                              <span className="truncate">🏷️ {t.hardwareType || 'Device'} ({t.uid.slice(0, 8)})</span>
                              <span className="text-[10px] text-faint font-bold">{t.status}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Templates & Assets Results */}
                    {searchResults.assets.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase text-faint tracking-wider mb-2 flex items-center gap-1.5 border-b border-line pb-1">
                          <Icon name="file-text" size={10} /> Media Templates & Files
                        </p>
                        <div className="space-y-1.5">
                          {searchResults.assets.slice(0, 3).map((a: any) => (
                            <a
                              key={a.id}
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => setSearchOpen(false)}
                              className="flex items-center justify-between p-2 rounded-xl hover:bg-canvas text-xs font-bold text-ink"
                            >
                              <span className="truncate">📄 {a.name}</span>
                              <span className="text-[10px] text-faint font-mono">{a.mimeType?.slice(0, 10) || 'file'}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notifications Results */}
                    {searchResults.notifications.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase text-faint tracking-wider mb-2 flex items-center gap-1.5 border-b border-line pb-1">
                          <Icon name="bell" size={10} /> Notifications
                        </p>
                        <div className="space-y-1.5">
                          {searchResults.notifications.slice(0, 3).map((n: any) => (
                            <Link
                              key={n.id}
                              href="/notifications"
                              onClick={() => setSearchOpen(false)}
                              className="flex items-center justify-between p-2 rounded-xl hover:bg-canvas text-xs font-bold text-ink"
                            >
                              <span className="truncate">🔔 {n.title}</span>
                              <span className="text-[10.5px] text-faint">{n.category}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right Action Button */}
          <div className="flex flex-shrink-0 items-center gap-2">
            <NotificationBell />
            {action}
          </div>
        </header>

        {/* Mobile Header Title */}
        {(title || action) && (
          <div className="flex items-center justify-between gap-4 px-5 pt-6 md:hidden">
            <h1 className="v-display text-[22px] font-extrabold tracking-tight text-ink">{title}</h1>
            {action}
          </div>
        )}

        {/* Main Panel Content */}
        <main className={`mx-auto px-5 py-6 md:px-10 md:py-8 ${fluid ? 'max-w-[1560px] w-full' : 'max-w-[1240px]'}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
