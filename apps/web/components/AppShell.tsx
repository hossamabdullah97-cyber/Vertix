'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { UsageSummary } from '@vertex/shared';
import { authFetch, logout, getActiveOrgId, setActiveOrgId, type Me } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { useTheme } from '@/lib/useStoredTheme';
import { Avatar } from '@/components/Avatar';
import { PROFILE_UPDATED } from '@/components/ProfilePhotoCard';
import { OrgMark, ORG_UPDATED } from '@/components/OrgMark';
import { NotificationBell } from '@/components/NotificationBell';
import { describe, linkOf } from '@/components/notifications/model';
import { OPEN_LEAD_EVENT } from '@/lib/events';
import { VMark } from '@/components/brand/VMark';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { DirectionalIcon } from '@/components/i18n/DirectionalIcon';
import { LOCALE_LABELS } from '@/lib/i18n/config';
import { UndoToast } from '@/components/ui/UndoToast';
import { ConnectionBanner } from '@/components/ui/ConnectionBanner';

// Labels are i18n keys (nav namespace), resolved at render time so the sidebar
// re-localizes instantly when the language changes. The first group needs no
// heading — it is where every session starts.
const GROUPS: { labelKey: string; showLabel: boolean; items: { href: string; labelKey: string; icon: string }[] }[] = [
  {
    labelKey: 'groups.overview',
    showLabel: false,
    items: [
      { href: '/dashboard', labelKey: 'items.dashboard', icon: 'gauge' },
      { href: '/analytics', labelKey: 'items.analytics', icon: 'chart-bar' },
    ],
  },
  {
    labelKey: 'groups.workspace',
    showLabel: true,
    items: [
      { href: '/cards', labelKey: 'items.cards', icon: 'grid' },
      { href: '/leads', labelKey: 'items.leads', icon: 'inbox' },
      { href: '/tags', labelKey: 'items.tags', icon: 'tag' },
    ],
  },
  {
    labelKey: 'groups.organization',
    showLabel: true,
    items: [
      { href: '/team', labelKey: 'items.team', icon: 'users' },
      { href: '/integrations', labelKey: 'items.integrations', icon: 'layers' },
      { href: '/workspace', labelKey: 'items.settings', icon: 'settings' },
    ],
  },
];

/** The phone's bottom bar: the four places people go most. Everything else is under More. */
const DOCK = ['/dashboard', '/cards', '/leads', '/analytics'];


/** Fired when the command menu picks a lead; the leads page opens its panel. */
export { OPEN_LEAD_EVENT };

type SearchIndex = {
  cards: any[];
  teams: any[];
  members: any[];
  departments: any[];
  leads: any[];
  tags: any[];
  assets: any[];
  notifications: any[];
};

const EMPTY_INDEX: SearchIndex = {
  cards: [],
  teams: [],
  members: [],
  departments: [],
  leads: [],
  tags: [],
  assets: [],
  notifications: [],
};

/** One row of the command menu: a page, or a record from the search index. */
type PaletteItem = {
  key: string;
  group: string;
  icon: string;
  label: string;
  meta?: string;
  metaMono?: boolean;
  href: string;
  external?: boolean;
  /** A lead to open in its panel once on /leads. */
  leadId?: string;
};

type OrgRow = { org: { id: string; name: string; slug: string; branding?: Record<string, unknown> | null }; role: string };

/**
 * What the sidebar last showed. Every page mounts its own shell, so without
 * this each move between pages started it empty (no name, no workspace, no
 * plan) until the same answers came back again. It starts from these and
 * refreshes behind them; a sign-out or a workspace switch reloads the page,
 * which clears it.
 */
let shellCache: { me: Me | null; orgs: OrgRow[] | null; usage: UsageSummary | null; orgId: string | null } | null = null;

export default function AppShell({
  title,
  action,
  mobileTitle = true,
  children,
  fluid = false,
  bleed = false,
}: {
  /** Plain text, or a breadcrumb for pages nested under another. */
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  fluid?: boolean;
  /** Drop the content padding and width cap so the page can lay out edge to edge. */
  bleed?: boolean;
  /** Show the title row on phones. Pages whose first line is already a heading (Home) turn it off. */
  mobileTitle?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation('nav');
  const { locale, setLocale } = useLocale();
  const { theme, pref: themePref, setPref: chooseTheme } = useTheme();
  const [me, setMe] = useState<Me | null>(shellCache?.me ?? null);
  const [usage, setUsage] = useState<UsageSummary | null>(shellCache?.usage ?? null);

  // Workspace switcher
  const [moreOpen, setMoreOpen] = useState(false);
  const [orgs, setOrgsState] = useState<OrgRow[]>(shellCache?.orgs ?? []);
  const [orgsLoaded, setOrgsLoaded] = useState(!!shellCache?.orgs);
  const setOrgs = (list: OrgRow[]) => {
    setOrgsState(list);
    setOrgsLoaded(true);
  };
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(shellCache?.orgId ?? null);
  // Whether the active workspace is known yet: it is read from storage after mount.
  const [ready, setReady] = useState(!!shellCache);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherSearch, setSwitcherSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [switcherIndex, setSwitcherIndex] = useState(0);

  // Command menu (⌘K / Ctrl+K)
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [searchData, setSearchData] = useState<SearchIndex>(EMPTY_INDEX);
  const [searchLoaded, setSearchLoaded] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // Account menu (language, appearance, sign out)
  const [menuOpen, setMenuOpen] = useState(false);
  // Shortcut hint in the platform's own notation (⌘K on Apple, Ctrl K elsewhere).
  const [shortcut, setShortcut] = useState('Ctrl K');

  const switcherRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut('⌘K');

    // Load favorites and recents from localStorage
    const savedFavs = JSON.parse(localStorage.getItem('vertex_favorites') || '[]');
    setFavorites(savedFavs);
    const savedRecents = JSON.parse(localStorage.getItem('vertex_recents') || '[]');
    setRecents(savedRecents);

    const activeId = getActiveOrgId();
    setSelectedOrgId(activeId);
    setReady(true);

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

    if (activeId) {
      authFetch<UsageSummary>('/billing/subscription')
        .then(setUsage)
        .catch(() => {});
    }

    // Close the popovers on an outside click.
    const clickOutside = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
      const inMenu =
        (menuRef.current && menuRef.current.contains(e.target as Node)) ||
        (mobileMenuRef.current && mobileMenuRef.current.contains(e.target as Node));
      if (!inMenu) setMenuOpen(false);
    };
    document.addEventListener('mousedown', clickOutside);

    // ⌘K / Ctrl+K opens the command menu from anywhere.
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Keep the sidebar identity in step when the user edits their profile.
    const onProfile = (e: Event) => setMe((e as CustomEvent<Me>).detail);
    window.addEventListener(PROFILE_UPDATED, onProfile);
    // And the workspace's name and mark when its settings are saved.
    const onOrg = () => authFetch<any[]>('/orgs').then(setOrgs).catch(() => {});
    window.addEventListener(ORG_UPDATED, onOrg);

    return () => {
      document.removeEventListener('mousedown', clickOutside);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener(PROFILE_UPDATED, onProfile);
      window.removeEventListener(ORG_UPDATED, onOrg);
    };
  }, []);

  useEffect(() => {
    if (ready) shellCache = { me, orgs: orgsLoaded ? orgs : null, usage, orgId: selectedOrgId };
  }, [ready, me, orgs, orgsLoaded, usage, selectedOrgId]);

  // Opening the menu loads the search index once, and always starts clean.
  useEffect(() => {
    if (!paletteOpen) return;
    setSearchQuery('');
    setPaletteIndex(0);
    requestAnimationFrame(() => searchInputRef.current?.focus());
    loadSearchIndex();
  }, [paletteOpen]);

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
    { id: 'personal', name: t('switcher.personal'), isOrg: false, slug: 'personal', branding: null as Record<string, unknown> | null },
    ...orgs.map((o) => ({ id: o.org.id, name: o.org.name, isOrg: true, slug: o.org.slug, branding: o.org.branding ?? null })),
  ], [orgs, t]);

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

  // Lazy load the search index the first time the command menu opens.
  const loadSearchIndex = async () => {
    if (searchLoading || searchLoaded) return;
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
      setSearchLoaded(true);
    } catch {} finally {
      setSearchLoading(false);
    }
  };

  const navItems = useMemo(() => {
    const items = GROUPS.flatMap((g) => g.items);
    return me?.isSuperAdmin
      ? [...items, { href: '/admin', labelKey: 'items.adminConsole', icon: 'shield' }]
      : items;
  }, [me?.isSuperAdmin]);

  // Everything the command menu can show for the current query, in display order.
  const paletteItems = useMemo<PaletteItem[]>(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) {
      return navItems.map((item) => ({
        key: `page-${item.href}`,
        group: t('searchGroups.pages'),
        icon: item.icon,
        label: t(item.labelKey),
        href: item.href,
      }));
    }
    const has = (v: unknown) => typeof v === 'string' && v.toLowerCase().includes(q);
    const items: PaletteItem[] = [];
    const push = (group: string, rows: Omit<PaletteItem, 'group'>[]) =>
      items.push(...rows.slice(0, 4).map((r) => ({ ...r, group })));

    push(
      t('searchGroups.pages'),
      navItems
        .filter((item) => has(t(item.labelKey)))
        .map((item) => ({ key: `page-${item.href}`, icon: item.icon, label: t(item.labelKey), href: item.href })),
    );
    push(
      t('searchGroups.cards'),
      searchData.cards
        .filter((c) => has(c.vcardData?.fullName) || has(c.slug))
        .map((c) => ({
          key: `card-${c.id}`,
          icon: 'grid',
          label: (c.vcardData?.fullName as string) || c.slug,
          meta: `/c/${c.slug}`,
          metaMono: true,
          href: `/cards/${c.id}`,
        })),
    );
    push(
      t('searchGroups.leads'),
      searchData.leads
        .filter((l) => has(l.name) || has(l.company) || has(l.email) || has(l.phone))
        .map((l) => ({
          key: `lead-${l.id}`,
          icon: 'inbox',
          label: l.name || t('unnamedLead'),
          meta: l.company || l.email || undefined,
          href: `/leads?lead=${l.id}`,
          leadId: l.id,
        })),
    );
    push(
      t('searchGroups.members'),
      searchData.members
        .filter((m) => has(m.user?.name) || has(m.user?.email))
        .map((m) => ({
          key: `member-${m.id}`,
          icon: 'user',
          label: m.user?.name || t('pendingMember'),
          meta: m.user?.email,
          href: `/team?member=${m.id}`,
        })),
    );
    push(
      t('searchGroups.departments'),
      searchData.departments
        .filter((d) => has(d.name))
        .map((d) => ({
          key: `dept-${d.id}`,
          icon: 'layers',
          label: d.name,
          meta: t('teamsCount', { count: d._count?.teams ?? 0 }),
          href: `/team?department=${d.id}`,
        })),
    );
    push(
      t('searchGroups.teams'),
      searchData.teams
        .filter((tm) => has(tm.name))
        .map((tm) => ({
          key: `team-${tm.id}`,
          icon: 'users',
          label: tm.name,
          meta: t('membersCount', { count: tm._count?.memberships ?? 0 }),
          href: `/team?team=${tm.id}`,
        })),
    );
    push(
      t('searchGroups.tags'),
      searchData.tags
        .filter((tg) => has(tg.uid) || has(tg.status) || has(tg.hardwareType))
        .map((tg) => ({
          key: `tag-${tg.id}`,
          icon: 'tag',
          label: tg.uid,
          meta: tg.status,
          href: '/tags',
        })),
    );
    push(
      t('searchGroups.files'),
      searchData.assets
        .filter((a) => has(a.name))
        .map((a) => ({
          key: `asset-${a.id}`,
          icon: 'file-text',
          label: a.name,
          meta: a.mimeType ?? undefined,
          href: a.url,
          external: true,
        })),
    );
    push(
      t('searchGroups.notifications'),
      searchData.notifications
        .map((n) => ({ n, said: describe(n, t, locale) }))
        .filter(({ n, said }) => has(said.title) || has(said.body) || has(n.title) || has(n.body))
        .map(({ n, said }) => ({
          key: `notif-${n.id}`,
          icon: 'bell',
          label: said.title,
          meta: said.body || t(`notifications:categories.${n.category}`, { defaultValue: n.category }),
          href: linkOf(n) ?? '/notifications',
        })),
    );
    return items;
  }, [searchQuery, searchData, navItems, t]);

  // Palette rows grouped for display, keeping the flat index for keyboard focus.
  const paletteGroups = useMemo(() => {
    const groups: { name: string; rows: { item: PaletteItem; index: number }[] }[] = [];
    paletteItems.forEach((item, index) => {
      const last = groups[groups.length - 1];
      if (last && last.name === item.group) last.rows.push({ item, index });
      else groups.push({ name: item.group, rows: [{ item, index }] });
    });
    return groups;
  }, [paletteItems]);

  const openPaletteItem = (item: PaletteItem | undefined) => {
    if (!item) return;
    setPaletteOpen(false);
    if (item.external) window.open(item.href, '_blank', 'noopener,noreferrer');
    else router.push(item.href);
    // Already on /leads the page does not remount, so tell it which lead to open.
    if (item.leadId) window.dispatchEvent(new CustomEvent(OPEN_LEAD_EVENT, { detail: item.leadId }));
  };

  const handlePaletteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPaletteIndex((i) => (paletteItems.length ? (i + 1) % paletteItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPaletteIndex((i) => (paletteItems.length ? (i - 1 + paletteItems.length) % paletteItems.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      openPaletteItem(paletteItems[paletteIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setPaletteOpen(false);
    }
  };

  // Until then the switcher shows a placeholder, not "Personal" or a blank name.
  const orgPending = !ready || (!!selectedOrgId && !orgsLoaded);
  const activeOrgName = selectedOrgId
    ? orgs.find((o) => o.org.id === selectedOrgId)?.org.name ?? ''
    : t('switcher.personal');

  const totalWorkspacesCount = allWorkspaceItems.length;

  function signOut() {
    logout();
    window.location.href = '/login';
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const moreItems = navItems.filter((n) => !DOCK.includes(n.href));
  // More closes when the page changes (back/forward too) and on Escape.
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);
  const moreActive = moreItems.some((n) => isActive(n.href));

  const roleLabel = me?.role ? t(`roles.${me.role}`) : '';
  const cardLimit = usage?.limits.cards ?? null;

  // The account menu, shared by the sidebar (opens upwards) and the phone bar.
  const accountMenu = (placement: 'up' | 'down') => (
    <div
      role="menu"
      aria-label={t('account.menu')}
      className={`absolute z-50 overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-lg ${
        // Upwards it spans the sidebar (which clips anything wider); on the phone bar it hangs from the avatar.
        placement === 'up' ? 'inset-x-0 bottom-full mb-2' : 'end-0 top-full mt-2 w-[248px]'
      }`}
    >
      <div className="px-2.5 pb-2 pt-1.5">
        <p className="truncate text-sm font-medium text-ink">{me?.name || me?.email || '—'}</p>
        {me?.name && <p className="truncate text-xs text-faint">{me.email}</p>}
      </div>
      <div className="border-t border-line px-2.5 py-2">
        <p className="mb-1.5 text-xs text-faint">{t('account.language')}</p>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
          {(['en', 'ar'] as const).map((code) => (
            <button
              key={code}
              role="menuitemradio"
              aria-checked={locale === code}
              onClick={() => setLocale(code)}
              className={`h-9 rounded-md text-xs font-medium transition-colors md:h-7 ${
                locale === code ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'
              }`}
            >
              {LOCALE_LABELS[code]}
            </button>
          ))}
        </div>
        <p className="mb-1.5 mt-3 text-xs text-faint">{t('account.theme')}</p>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
          {(['light', 'dark', 'system'] as const).map((mode) => (
            <button
              key={mode}
              role="menuitemradio"
              aria-checked={themePref === mode}
              onClick={() => chooseTheme(mode)}
              className={`flex h-9 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors md:h-7 ${
                themePref === mode ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'
              }`}
            >
              <Icon name={mode === 'light' ? 'sun' : mode === 'dark' ? 'moon' : 'monitor'} size={13} />
              {t(`account.${mode}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="border-t border-line pt-1">
        <button
          role="menuitem"
          onClick={signOut}
          className="flex h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted transition-colors hover:bg-elevated hover:text-ink md:h-8"
        >
          <Icon name="logout" size={15} />
          {t('signOut')}
        </button>
      </div>
    </div>
  );

  return (
    <div data-theme={theme} className="min-h-screen bg-canvas text-ink antialiased [--v-dock:calc(64px+env(safe-area-inset-bottom))] md:flex md:h-screen md:overflow-hidden md:[--v-dock:0px]">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-[244px] shrink-0 flex-col gap-0.5 overflow-y-auto px-3 pb-3 pt-3.5 md:flex">
        <Link href="/dashboard" className="mb-2 flex items-center gap-2.5 px-2 py-1">
          <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-accent text-white">
            <VMark size={14} strokeWidth={3} />
          </span>
          <span className="text-base font-semibold tracking-tight text-ink">Vertex</span>
        </Link>

        {/* Workspace switcher */}
        <div ref={switcherRef} className="relative z-40 mb-2">
          <button
            onClick={() => setSwitcherOpen(!switcherOpen)}
            aria-expanded={switcherOpen}
            className="flex w-full items-center gap-2.5 rounded-lg bg-surface px-2 py-1.5 text-start shadow-sm ring-1 ring-line transition-colors hover:bg-elevated"
          >
            {orgPending ? (
              <span aria-hidden className="v-skeleton h-[22px] w-[22px] shrink-0 rounded-md" />
            ) : selectedOrgId ? (
              <OrgMark name={activeOrgName} branding={orgs.find((o) => o.org.id === selectedOrgId)?.org.branding} size={22} />
            ) : (
              <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-elevated text-muted ring-1 ring-inset ring-line">
                <Icon name="user" size={12} />
              </span>
            )}
            {orgPending ? (
              <span aria-hidden className="flex-1">
                <span className="v-skeleton block h-3 w-24 rounded" />
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{activeOrgName}</span>
            )}
            <span className="text-faint">
              <Icon name="chevron-down" size={14} />
            </span>
          </button>

          {switcherOpen && (
            <div className="absolute inset-x-0 top-full z-50 mt-1.5 space-y-1.5 rounded-xl border border-line bg-surface p-1.5 text-start shadow-lg">
              {totalWorkspacesCount <= 1 ? (
                <p className="px-2.5 py-3 text-center text-xs text-muted">{t('switcher.onlyOne')}</p>
              ) : (
                <>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-faint">
                      <Icon name="search" size={13} />
                    </span>
                    <input
                      type="text"
                      placeholder={t('searchWorkspace')}
                      value={switcherSearch}
                      onChange={(e) => {
                        setSwitcherSearch(e.target.value);
                        setSwitcherIndex(0);
                      }}
                      onKeyDown={handleSwitcherKeyDown}
                      className="h-8 w-full rounded-md border border-line bg-surface pe-2 ps-8 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                      autoFocus
                    />
                  </div>

                  <div className="no-scrollbar max-h-[240px] space-y-1 overflow-y-auto">
                    {favorites.length > 0 && switcherSearch === '' && (
                      <div className="border-b border-line pb-1">
                        <p className="px-2.5 pb-1 pt-1 text-2xs text-faint">{t('switcher.favorites')}</p>
                        {allWorkspaceItems
                          .filter((item) => favorites.includes(item.id))
                          .map((item) => {
                            const isHighlighted = visibleSwitcherItems[switcherIndex]?.id === item.id && visibleSwitcherItems[switcherIndex]?.type === 'fav';
                            return (
                              <button
                                key={`fav-${item.id}`}
                                onClick={() => handleSwitchOrg(item.isOrg ? item.id : null)}
                                className={`flex h-8 w-full items-center justify-between gap-2 rounded-md px-2.5 text-start text-xs text-ink transition-colors hover:bg-elevated ${
                                  isHighlighted ? 'bg-elevated' : ''
                                }`}
                              >
                                <span className="truncate">{item.name}</span>
                                <span
                                  onClick={(e) => toggleFavorite(item.id, e)}
                                  title={t('switcher.unfavorite')}
                                  className="text-amber-500 hover:text-muted"
                                >
                                  ★
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    )}

                    {recents.length > 0 && switcherSearch === '' && (
                      <div className="border-b border-line pb-1">
                        <p className="px-2.5 pb-1 pt-1 text-2xs text-faint">{t('switcher.recents')}</p>
                        {allWorkspaceItems
                          .filter((item) => recents.includes(item.id))
                          .map((item) => {
                            const isHighlighted = visibleSwitcherItems[switcherIndex]?.id === item.id && visibleSwitcherItems[switcherIndex]?.type === 'recent';
                            return (
                              <button
                                key={`rec-${item.id}`}
                                onClick={() => handleSwitchOrg(item.isOrg ? item.id : null)}
                                className={`flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-start text-xs text-ink transition-colors hover:bg-elevated ${
                                  isHighlighted ? 'bg-elevated' : ''
                                }`}
                              >
                                <span className="truncate">{item.name}</span>
                              </button>
                            );
                          })}
                      </div>
                    )}

                    <div>
                      <p className="px-2.5 pb-1 pt-1 text-2xs text-faint">{t('switcher.workspaces')}</p>
                      {filteredItems.map((item) => {
                        const active = selectedOrgId === (item.isOrg ? item.id : null);
                        const isFav = favorites.includes(item.id);
                        const isHighlighted = visibleSwitcherItems[switcherIndex]?.id === item.id && visibleSwitcherItems[switcherIndex]?.type === 'all';

                        return (
                          <div
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            className={`group flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 text-xs transition-colors ${
                              active ? 'text-ink' : isHighlighted ? 'bg-elevated text-ink' : 'text-muted hover:bg-elevated hover:text-ink'
                            }`}
                            onClick={() => handleSwitchOrg(item.isOrg ? item.id : null)}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {item.isOrg ? (
                                <OrgMark name={item.name} branding={item.branding} size={18} />
                              ) : (
                                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded bg-elevated text-muted ring-1 ring-inset ring-line">
                                  <Icon name="user" size={10} />
                                </span>
                              )}
                              <span className="truncate">{item.name}</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                              {active && (
                                <span className="text-accent">
                                  <Icon name="check" size={13} />
                                </span>
                              )}
                              <span
                                onClick={(e) => toggleFavorite(item.id, e)}
                                title={isFav ? t('switcher.unfavorite') : t('switcher.favorite')}
                                className={isFav ? 'text-amber-500' : 'text-faint opacity-0 hover:text-amber-500 group-hover:opacity-100'}
                              >
                                {isFav ? '★' : '☆'}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                      {filteredItems.length === 0 && (
                        <p className="py-4 text-center text-xs text-faint">{t('switcher.noResults')}</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <button onClick={() => setPaletteOpen(true)} className="v-nav-item w-full text-faint">
          <Icon name="search" size={16} />
          <span className="flex-1 text-start">{t('search')}</span>
          <kbd className="font-mono text-2xs text-faint">{shortcut}</kbd>
        </button>

        <nav className="flex flex-col gap-0.5">
          {GROUPS.map((group) => (
            <div key={group.labelKey} className="flex flex-col gap-0.5">
              {group.showLabel && (
                <p className="px-2 pb-1 pt-4 text-2xs font-medium text-faint">{t(group.labelKey)}</p>
              )}
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href} className="v-nav-item" data-active={active}>
                    <span className={active ? 'text-accent' : 'text-faint'}>
                      <Icon name={item.icon} size={16} />
                    </span>
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </div>
          ))}

          {me?.isSuperAdmin && (
            <div className="flex flex-col gap-0.5">
              <p className="px-2 pb-1 pt-4 text-2xs font-medium text-faint">{t('groups.administration')}</p>
              <Link href="/admin" className="v-nav-item" data-active={pathname.startsWith('/admin')}>
                <span className={pathname.startsWith('/admin') ? 'text-accent' : 'text-faint'}>
                  <Icon name="shield" size={16} />
                </span>
                {t('items.adminConsole')}
              </Link>
            </div>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-2 pt-4">
          {usage && (
            <Link
              href="/billing"
              className="block rounded-xl bg-surface p-3 shadow-sm ring-1 ring-line transition-colors hover:bg-elevated"
            >
              <span className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-ink">{t(`billing:plans.${usage.plan}`)}</span>
                <span className="tabular text-faint">
                  {cardLimit === null
                    ? t('plan.cardsUnlimited', { used: usage.usage.cards })
                    : t('plan.cards', { used: usage.usage.cards, limit: cardLimit })}
                </span>
              </span>
              {cardLimit !== null && (
                <span className="mt-2.5 flex gap-[3px]" aria-hidden>
                  {cardLimit <= 12 ? (
                    Array.from({ length: cardLimit }, (_, i) => (
                      <span
                        key={i}
                        className={`h-1 flex-1 rounded-full ${i < usage.usage.cards ? 'bg-accent' : 'bg-line'}`}
                      />
                    ))
                  ) : (
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{ width: `${Math.min(100, (usage.usage.cards / cardLimit) * 100)}%` }}
                      />
                    </span>
                  )}
                </span>
              )}
              <span className="mt-2.5 block text-xs font-medium text-accent">{t('plan.compare')}</span>
            </Link>
          )}

          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-ink/[0.045]"
            >
              {me ? <Avatar user={me} size={28} verified={me.verified} /> : <span aria-hidden className="v-skeleton h-7 w-7 shrink-0 rounded-full" />}
              {me ? (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{me.name || me.email}</span>
                  {roleLabel && <span className="block truncate text-2xs text-faint">{roleLabel}</span>}
                </span>
              ) : (
                <span aria-hidden className="flex-1 space-y-1.5">
                  <span className="v-skeleton block h-3 w-24 rounded" />
                  <span className="v-skeleton block h-2.5 w-12 rounded" />
                </span>
              )}
              <span className="text-faint">
                <Icon name="dots" size={16} />
              </span>
            </button>
            {menuOpen && accountMenu('up')}
          </div>
        </div>
      </aside>

      {/* Phone bar */}
      <div className="v-glass sticky top-0 z-30 md:hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-1.5">
          <Link href="/dashboard" className="flex min-h-11 items-center gap-2 px-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-accent text-white">
              <VMark size={14} strokeWidth={3} />
            </span>
            <span className="text-md font-semibold tracking-tight">Vertex</span>
          </Link>
          <div className="flex items-center">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-ink/5"
              aria-label={t('search')}
            >
              <Icon name="search" size={18} />
            </button>
            <NotificationBell />
            <div ref={mobileMenuRef} className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label={t('account.menu')}
                aria-expanded={menuOpen}
                className="flex h-11 w-11 items-center justify-center rounded-lg"
              >
                {me ? <Avatar user={me} size={28} verified={me.verified} /> : <Icon name="user" size={18} />}
              </button>
              {menuOpen && accountMenu('down')}
            </div>
          </div>
        </div>
        <ConnectionBanner className="flex md:hidden" />
      </div>

      {/* Content sheet: its own scroll area beside a still sidebar on desktop */}
      <div className="min-w-0 flex-1 md:py-2 md:pe-2">
        <div className="bg-surface md:h-full md:overflow-y-auto md:rounded-[14px] md:shadow-[0_0_0_1px_hsl(var(--v-border)),0_1px_2px_rgba(23,23,26,0.04)]">
          {/* The connection line and the title bar stay on top together while the page scrolls. */}
          <div className="sticky top-0 z-20">
          <ConnectionBanner className="hidden md:flex" />
          <header className="hidden h-14 items-center gap-3 border-b border-line bg-surface/90 px-7 backdrop-blur-md md:flex">
            <h1 className="flex min-w-0 flex-1 items-center gap-2 truncate text-base font-semibold text-ink">{title}</h1>
            <div className="flex shrink-0 items-center gap-2">
              <NotificationBell />
              {action}
            </div>
          </header>
          </div>

          {mobileTitle && (title || action) && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 md:hidden">
              <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
              {action}
            </div>
          )}

          <main className={bleed ? '' : `mx-auto px-5 py-6 md:px-8 md:py-7 ${fluid ? 'w-full max-w-[1560px]' : 'max-w-[1240px]'}`}>
            {children}
          </main>
          {/* Room for the phone's bottom bar, so the last row is never under it. */}
          <div className="h-[var(--v-dock)] md:hidden" aria-hidden />
        </div>
      </div>

      {/* Phone bottom bar: the four places people go most, and the rest under More. */}
      <nav
        aria-label={t('mobile.label')}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="grid h-16 grid-cols-5">
          {DOCK.map((href) => {
            const item = navItems.find((n) => n.href === href)!;
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-1 text-2xs font-medium transition-colors ${active ? 'text-accent' : 'text-muted'}`}
                >
                  <Icon name={item.icon} size={21} />
                  <span className="max-w-full truncate px-1">{t(`mobile.short.${item.labelKey.split('.').pop()}`, { defaultValue: t(item.labelKey) })}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              className={`flex h-full w-full flex-col items-center justify-center gap-1 text-2xs font-medium transition-colors ${moreActive ? 'text-accent' : 'text-muted'}`}
            >
              <Icon name="menu" size={21} />
              <span>{t('mobile.more')}</span>
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[100] md:hidden" role="dialog" aria-modal="true" aria-label={t('mobile.more')}>
          <div className="p-scrim absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div
            className="p-sheet absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-surface shadow-2xl"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line" aria-hidden />
            <ul className="grid grid-cols-3 gap-2 p-4">
              {moreItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl text-center text-xs font-medium ring-1 ring-inset transition-colors ${
                        active ? 'bg-accent/10 text-accent ring-accent/30' : 'bg-elevated text-ink ring-line'
                      }`}
                    >
                      <Icon name={item.icon} size={20} />
                      <span className="max-w-full truncate px-1">{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {totalWorkspacesCount > 1 && (
              <div className="border-t border-line px-4 pb-2 pt-3">
                <p className="px-1 pb-1.5 text-xs font-medium text-faint">{t('switcher.workspaces')}</p>
                <ul>
                  {allWorkspaceItems.map((item) => {
                    const active = selectedOrgId === (item.isOrg ? item.id : null);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setMoreOpen(false);
                            if (!active) handleSwitchOrg(item.isOrg ? item.id : null);
                          }}
                          className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-start text-base text-ink hover:bg-elevated"
                        >
                          {item.isOrg ? (
                            <OrgMark name={item.name} branding={item.branding} size={26} />
                          ) : (
                            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-elevated text-muted ring-1 ring-inset ring-line">
                              <Icon name="user" size={14} />
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate">{item.name}</span>
                          {active && (
                            <span className="text-accent">
                              <Icon name="check" size={16} />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Command menu */}
      {paletteOpen && (
        <div className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[12vh]">
          <div className="absolute inset-0 bg-canvas/70 backdrop-blur-[2px]" onClick={() => setPaletteOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('search')}
            className="relative w-full max-w-[620px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <span className="text-faint">
                <Icon name="search" size={17} />
              </span>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPaletteIndex(0);
                }}
                onKeyDown={handlePaletteKeyDown}
                placeholder={t('searchPlaceholder')}
                className="h-14 min-w-0 flex-1 bg-transparent text-md text-ink placeholder:text-faint focus:outline-none"
                aria-activedescendant={paletteItems[paletteIndex]?.key}
              />
              <button onClick={() => setPaletteOpen(false)} className="v-kbd shrink-0" aria-label={t('searchKeys.close')}>
                Esc
              </button>
            </div>

            <div className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5">
              {searchQuery && searchLoading && !searchLoaded ? (
                <p className="px-3 py-6 text-center text-sm text-muted">{t('searchLoading')}</p>
              ) : paletteItems.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted">{t('searchEmpty', { query: searchQuery })}</p>
              ) : (
                paletteGroups.map((group) => (
                  <div key={group.name} className="pb-1">
                    <p className="px-2.5 pb-1 pt-2 text-2xs font-medium text-faint">{group.name}</p>
                    {group.rows.map(({ item, index }) => (
                      <button
                        key={item.key}
                        id={item.key}
                        onMouseEnter={() => setPaletteIndex(index)}
                        onClick={() => openPaletteItem(item)}
                        className={`flex h-11 w-full items-center gap-3 rounded-lg px-2.5 text-start text-sm text-ink sm:h-10 ${
                          index === paletteIndex ? 'bg-elevated' : ''
                        }`}
                      >
                        <span className="text-faint">
                          <Icon name={item.icon} size={15} />
                        </span>
                        <span className="min-w-0 truncate">{item.label}</span>
                        {item.meta && (
                          <span className={`min-w-0 truncate text-xs text-faint ${item.metaMono ? 'font-mono' : ''}`}>
                            {item.meta}
                          </span>
                        )}
                        {index === paletteIndex && (
                          <span className="ms-auto text-faint">
                            {item.external ? <Icon name="external-link" size={14} /> : <DirectionalIcon name="arrow" size={14} />}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>

            <div className="hidden items-center gap-4 border-t border-line bg-elevated px-4 py-2.5 text-xs text-faint sm:flex">
              <span className="flex items-center gap-1.5">
                <span className="v-kbd">↑</span>
                <span className="v-kbd">↓</span>
                {t('searchKeys.navigate')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="v-kbd">↵</span>
                {t('searchKeys.open')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="v-kbd">Esc</span>
                {t('searchKeys.close')}
              </span>
            </div>
          </div>
        </div>
      )}
      <UndoToast />
    </div>
  );
}
