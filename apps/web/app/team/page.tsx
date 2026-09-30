'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { UsageSummary } from '@vertex/shared';
import { authFetch, getActiveOrgId, getToken, inviteMember, PlanLimitError, type Card, type Me, type Member, type NfcTag, type Role, type Team, apiMessageOf, type ApiError, peek } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { CardThumb } from '@/components/cards/CardThumb';
import { ProfilePhotoCard } from '@/components/ProfilePhotoCard';
import { ActionMenu, type ActionItem } from '@/components/ui/ActionMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Sheet } from '@/components/ui/Sheet';
import { TeamsView, type Department, type TeamRow } from '@/components/team/TeamsView';
import { ImportPeople } from '@/components/team/ImportPeople';
import { RolesView } from '@/components/team/RolesView';
import { ActivityView } from '@/components/team/ActivityView';

type View = 'members' | 'teams' | 'roles' | 'activity';
const VIEWS: View[] = ['members', 'teams', 'roles', 'activity'];
const ROLES: Role[] = ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE'];

/** The list endpoint also returns when someone joined. */
type MemberRow = Member & { createdAt?: string };

const personName = (m: Member) => m.user.name?.trim() || m.user.email;

export default function TeamPage() {
  const router = useRouter();
  const { t } = useTranslation('teams');
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);

  const [orgId, setOrgId] = useState<string | null | undefined>(undefined);
  // Opened again, the page starts from what it showed last time and refreshes behind it.
  const [me, setMe] = useState<Me | null>(() => peek<Me>('/auth/me') ?? null);
  const [members, setMembers] = useState<MemberRow[] | null>(() => peek<MemberRow[]>('/orgs/members') ?? null);
  const [teams, setTeams] = useState<TeamRow[]>(() => peek<TeamRow[]>('/orgs/teams') ?? []);
  const [departments, setDepartments] = useState<Department[]>(() => peek<Department[]>('/orgs/departments') ?? []);
  const [cards, setCards] = useState<Card[]>(() => peek<Card[]>('/cards') ?? []);
  const [tags, setTags] = useState<NfcTag[]>(() => peek<NfcTag[]>('/nfc/tags') ?? []);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [view, setView] = useState<View>('members');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [teamFilter, setTeamFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<MemberRow | null>(null);
  const [focusTeam, setFocusTeam] = useState<string | null>(null);
  const [focusDepartment, setFocusDepartment] = useState<string | null>(null);

  const canManage = me?.role === 'OWNER' || me?.role === 'ADMIN';

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }

  const load = useCallback(async () => {
    const [mem, tm, dep, crd, tg] = await Promise.all([
      authFetch<MemberRow[]>('/orgs/members'),
      authFetch<TeamRow[]>('/orgs/teams').catch(() => []),
      authFetch<Department[]>('/orgs/departments').catch(() => []),
      authFetch<Card[]>('/cards').catch(() => []),
      authFetch<NfcTag[]>('/nfc/tags').catch(() => []),
    ]);
    setMembers(mem);
    setTeams(tm);
    setDepartments(dep);
    setCards(crd);
    setTags(tg);
  }, []);

  // Where the page is linked from (search, Home, old team pages): a view and,
  // optionally, the person or team to open.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get('view') as View | null;
    if (v && VIEWS.includes(v)) setView(v);
    if (p.get('member')) setSelectedId(p.get('member'));
    if (p.get('team')) {
      setView('teams');
      setFocusTeam(p.get('team'));
    }
    if (p.get('department')) {
      setView('teams');
      setFocusDepartment(p.get('department'));
    }
  }, []);

  function chooseView(next: View) {
    setView(next);
    const url = new URL(window.location.href);
    url.search = next === 'members' ? '' : `?view=${next}`;
    window.history.replaceState(null, '', url);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    const active = getActiveOrgId();
    setOrgId(active);
    authFetch<Me>('/auth/me').then(setMe).catch(() => setMe(null));
    if (!active) return;
    load().catch((e) => {
      // Members are a manager's view; an employee is told so rather than shown an error.
      if ((e as ApiError).status === 403 || /forbidden|permission/i.test(apiMessageOf(e))) setForbidden(true);
      else setError((e as Error).message);
      setMembers([]);
    });
  }, [router, load]);

  /** Runs a change, reloads and confirms it; the error stays visible where the user is. */
  const act = useCallback(
    async (fn: () => Promise<unknown>, done: string) => {
      setError('');
      try {
        await fn();
        flash(done);
        await load();
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    },
    [load],
  );

  const cardsByOwner = useMemo(() => {
    const by = new Map<string, Card[]>();
    for (const c of cards) by.set(c.ownerId, [...(by.get(c.ownerId) ?? []), c]);
    return by;
  }, [cards]);
  const chipsByHolder = useMemo(() => {
    const by = new Map<string, number>();
    for (const tg of tags) if (tg.assignedUserId) by.set(tg.assignedUserId, (by.get(tg.assignedUserId) ?? 0) + 1);
    return by;
  }, [tags]);

  const counts = useMemo(() => {
    const list = members ?? [];
    return {
      all: list.length,
      active: list.filter((m) => m.status === 'ACTIVE').length,
      invited: list.filter((m) => m.status === 'INVITED').length,
    };
  }, [members]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (members ?? []).filter((m) => {
      if (roleFilter && m.role !== roleFilter) return false;
      if (teamFilter === 'none' ? m.teamId : teamFilter && m.teamId !== teamFilter) return false;
      return !q || `${m.user.name ?? ''} ${m.user.email}`.toLowerCase().includes(q);
    });
  }, [members, query, roleFilter, teamFilter]);

  const selected = members?.find((m) => m.id === selectedId) ?? null;
  const filtersActive = query.trim() !== '' || roleFilter !== '' || teamFilter !== '';
  const closeMember = useCallback(() => setSelectedId(null), []);
  const closeInvite = useCallback(() => setInviting(false), []);
  const [importing, setImporting] = useState(false);
  const closeRemove = useCallback(() => setRemoving(null), []);

  // Shown at once; the reload after it confirms, and a refusal puts it back.
  const patchMember = (m: MemberRow, body: { role?: Member['role']; status?: string; teamId?: string | null }, done: string) => {
    const before = members;
    setMembers((list) =>
      list?.map((x) => {
        if (x.id !== m.id) return x;
        const next = { ...x, ...body };
        if ('teamId' in body) {
          const team = teams.find((tm) => tm.id === body.teamId);
          next.team = team ? { id: team.id, name: team.name } : null;
        }
        return next;
      }) ?? list,
    );
    act(() => authFetch(`/orgs/members/${m.id}`, { method: 'PATCH', body: JSON.stringify(body) }), done).catch(() => setMembers(before));
  };

  const menuFor = (m: MemberRow): ActionItem[] => {
    const self = m.user.id === me?.id;
    const items: ActionItem[] = [{ key: 'open', label: t('actions.details'), icon: 'user', onSelect: () => setSelectedId(m.id) }];
    if (canManage && !self && m.role !== 'OWNER') {
      items.push(
        m.status === 'SUSPENDED'
          ? { key: 'reactivate', label: t('actions.reactivate'), icon: 'check', separated: true, onSelect: () => patchMember(m, { status: 'ACTIVE' }, t('toasts.reactivated')) }
          : { key: 'suspend', label: t('actions.suspend'), icon: 'lock', separated: true, onSelect: () => patchMember(m, { status: 'SUSPENDED' }, t('toasts.suspended')) },
      );
    }
    if (canManage && !self && (m.role !== 'OWNER' || me?.role === 'OWNER')) {
      items.push({ key: 'remove', label: t('actions.remove'), icon: 'trash', danger: true, separated: m.role === 'OWNER', onSelect: () => setRemoving(m) });
    }
    return items;
  };

  // ---------------------------------------------------------------------------
  // A personal workspace has no team; it keeps the profile photo, which lives here.
  if (orgId === null) {
    return (
      <AppShell title={t('title')}>
        <div className="mx-auto max-w-[560px] space-y-4">
          <div className="rounded-xl px-6 py-8 text-center ring-1 ring-inset ring-line">
            <h2 className="text-lg font-semibold text-ink">{t('personal.title')}</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{t('personal.body')}</p>
          </div>
          {me && <ProfilePhotoCard me={me} onChange={setMe} />}
        </div>
      </AppShell>
    );
  }

  const views = VIEWS.filter((v) => v !== 'activity' || canManage);

  return (
    <AppShell
      title={t('title')}
      fluid
      action={
        canManage && (
          <div className="flex gap-2">
            <button onClick={() => setImporting(true)} className="v-btn v-btn-ghost">
              <Icon name="upload" size={14} /> <span className="hidden sm:inline">{t('import.button')}</span>
            </button>
            <button onClick={() => setInviting(true)} className="v-btn">
              <Icon name="plus" size={14} /> {t('invite.button')}
            </button>
          </div>
        )
      }
    >
      {members && members.length > 0 && (
        <p className="text-base text-muted">
          <span className="font-medium text-ink">{t('summary.people', { count: counts.all, value: fmt(counts.all) })}</span>
          <span className="mx-2 text-faint" aria-hidden>
            ·
          </span>
          {t('summary.active', { count: counts.active, value: fmt(counts.active) })}
          {counts.invited > 0 && (
            <>
              <span className="mx-2 text-faint" aria-hidden>
                ·
              </span>
              {t('summary.invited', { count: counts.invited, value: fmt(counts.invited) })}
            </>
          )}
          <span className="mx-2 text-faint" aria-hidden>
            ·
          </span>
          {t('summary.teams', { count: teams.length, value: fmt(teams.length) })}
        </p>
      )}

      {forbidden ? (
        <div className="mx-auto mt-6 max-w-[520px] rounded-xl px-6 py-10 text-center ring-1 ring-inset ring-line">
          <h2 className="text-lg font-semibold text-ink">{t('forbidden.title')}</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{t('forbidden.body')}</p>
        </div>
      ) : (
        <>
          <nav role="tablist" aria-label={t('views.label')} className="no-scrollbar -mx-5 mt-4 flex gap-5 overflow-x-auto border-b border-line px-5 md:-mx-8 md:px-8">
            {views.map((v) => {
              const active = view === v;
              const count = v === 'members' ? counts.all : v === 'teams' ? teams.length : undefined;
              return (
                <button
                  key={v}
                  role="tab"
                  aria-selected={active}
                  onClick={() => chooseView(v)}
                  className={`relative flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-medium transition-colors sm:min-h-10 ${
                    active ? 'text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {t(`views.${v}`)}
                  {count !== undefined && members && <span className="tabular text-xs text-faint">{count}</span>}
                  {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink" />}
                </button>
              );
            })}
          </nav>

          {error && !selected && !inviting && (
            <div role="alert" className="mt-4 flex items-start gap-3 rounded-lg bg-red-500/[0.06] px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-300">
              <span className="flex-1">{error}</span>
              <button onClick={() => setError('')} aria-label={t('actions.dismiss')} className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-red-500/10">
                <Icon name="x" size={13} />
              </button>
            </div>
          )}

          {members === null ? (
            <div className="mt-6 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="v-skeleton h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : view === 'members' ? (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <label className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
                  <span className="sr-only">{t('filters.search')}</span>
                  <span className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-faint">
                    <Icon name="search" size={14} />
                  </span>
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('filters.search')} className="v-field !ps-8 !text-sm sm:!h-8" />
                </label>
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | '')} aria-label={t('filters.role')} className="v-field !h-11 !w-auto !py-0 !pe-8 !text-sm sm:!h-8">
                  <option value="">{t('filters.allRoles')}</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`roles.${r}.name`)}
                    </option>
                  ))}
                </select>
                {teams.length > 0 && (
                  <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} aria-label={t('filters.team')} className="v-field !h-11 !w-auto !py-0 !pe-8 !text-sm sm:!h-8">
                    <option value="">{t('filters.allTeams')}</option>
                    {teams.map((tm) => (
                      <option key={tm.id} value={tm.id}>
                        {tm.name}
                      </option>
                    ))}
                    <option value="none">{t('filters.noTeam')}</option>
                  </select>
                )}
                {filtersActive && (
                  <>
                    <span className="text-xs text-faint">{t('filters.results', { count: shown.length })}</span>
                    <button
                      onClick={() => {
                        setQuery('');
                        setRoleFilter('');
                        setTeamFilter('');
                      }}
                      className="min-h-11 text-xs font-medium text-accent hover:underline sm:min-h-0"
                    >
                      {t('filters.clear')}
                    </button>
                  </>
                )}
              </div>

              <div className="mt-4">
                {members.length <= 1 && canManage && !filtersActive ? (
                  <div className="mb-4 flex flex-col items-start gap-3 rounded-xl border border-dashed border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted">{t('empty.alone')}</p>
                    <button onClick={() => setInviting(true)} className="v-btn v-btn-ghost shrink-0">
                      <Icon name="plus" size={14} /> {t('invite.button')}
                    </button>
                  </div>
                ) : null}
                {shown.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-14 text-center">
                    <p className="text-sm text-muted">{t('empty.noMatch')}</p>
                  </div>
                ) : (
                  <div className="v-card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="v-table">
                        <thead>
                          <tr>
                            <th>{t('table.person')}</th>
                            <th>{t('table.role')}</th>
                            <th className="hidden md:table-cell">{t('table.team')}</th>
                            <th className="hidden sm:table-cell">{t('table.status')}</th>
                            <th className="hidden !text-end lg:table-cell">{t('table.cards')}</th>
                            <th className="hidden !text-end lg:table-cell">{t('table.chips')}</th>
                            <th className="w-12">
                              <span className="sr-only">{t('table.actions')}</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((m) => (
                            <tr
                              key={m.id}
                              tabIndex={0}
                              onClick={() => setSelectedId(m.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.target === e.currentTarget) setSelectedId(m.id);
                              }}
                              className={`cursor-pointer outline-none focus-visible:[&>td]:bg-elevated ${selectedId === m.id ? '[&>td]:!bg-accent/[0.06]' : ''}`}
                            >
                              <td className="w-full max-w-0">
                                <span className="flex min-w-0 items-center gap-3">
                                  <Avatar user={m.user} size={32} />
                                  <span className="min-w-0">
                                    <span className="flex items-center gap-1.5">
                                      <span className="truncate font-medium text-ink">{personName(m)}</span>
                                      {m.user.id === me?.id && <span className="shrink-0 text-xs text-faint">{t('table.you')}</span>}
                                    </span>
                                    {m.user.name && (
                                      <span dir="ltr" className="block truncate text-start text-xs text-faint rtl:text-right">
                                        {m.user.email}
                                      </span>
                                    )}
                                  </span>
                                </span>
                              </td>
                              <td className="whitespace-nowrap text-muted">{t(`roles.${m.role}.name`)}</td>
                              <td className="hidden whitespace-nowrap md:table-cell">{m.team ? <span className="text-muted">{m.team.name}</span> : <span className="text-faint">—</span>}</td>
                              <td className="hidden sm:table-cell">
                                <MemberStatus status={m.status} />
                              </td>
                              <td className="hidden text-end lg:table-cell">{fmt(cardsByOwner.get(m.user.id)?.length ?? 0)}</td>
                              <td className="hidden text-end lg:table-cell">{fmt(chipsByHolder.get(m.user.id) ?? 0)}</td>
                              <td>
                                <ActionMenu label={t('actions.more')} items={menuFor(m)} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : view === 'teams' ? (
            <TeamsView
              teams={teams}
              departments={departments}
              members={members}
              canManage={canManage}
              focusTeam={focusTeam}
              focusDepartment={focusDepartment}
              onFocusHandled={() => {
                setFocusTeam(null);
                setFocusDepartment(null);
              }}
              onChanged={() => load()}
              onDone={flash}
              onOpenMember={(id) => setSelectedId(id)}
            />
          ) : view === 'roles' ? (
            <RolesView myRole={me?.role} members={members} />
          ) : (
            <ActivityView />
          )}
        </>
      )}

      <MemberDetails
        member={selected}
        me={me}
        teams={teams}
        cards={selected ? cardsByOwner.get(selected.user.id) ?? [] : []}
        chips={selected ? chipsByHolder.get(selected.user.id) ?? 0 : 0}
        canManage={canManage}
        error={selected ? error : ''}
        onClose={closeMember}
        onRole={(role) => selected && patchMember(selected, { role }, t('toasts.roleUpdated'))}
        onTeam={(teamId) => selected && patchMember(selected, { teamId: teamId || null }, t('toasts.teamUpdated'))}
        onStatus={(status) => selected && patchMember(selected, { status }, status === 'SUSPENDED' ? t('toasts.suspended') : t('toasts.reactivated'))}
        onRemove={() => selected && setRemoving(selected)}
      />

      <ImportPeople open={importing} onClose={() => setImporting(false)} onImported={() => load().catch(() => {})} />
      <InvitePeople open={inviting} onClose={closeInvite} teams={teams} myRole={me?.role} onInvited={() => load().catch(() => {})} />

      <ConfirmDialog
        open={removing !== null}
        title={removing ? t('remove.title', { name: personName(removing) }) : ''}
        body={t('remove.body')}
        confirmLabel={t('actions.remove')}
        busyLabel={t('actions.removing')}
        cancelLabel={t('actions.cancel')}
        danger
        onConfirm={async () => {
          if (!removing) return;
          await authFetch(`/orgs/members/${removing.id}`, { method: 'DELETE' });
          const gone = removing.id;
          setMembers((list) => list?.filter((m) => m.id !== gone) ?? list);
          if (selectedId === gone) setSelectedId(null);
          setRemoving(null);
          flash(t('toasts.removed'));
          // Counts elsewhere on the page (teams, cards) catch up behind it.
          load().catch(() => {});
        }}
        onCancel={closeRemove}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role="status"
            className="fixed inset-x-0 bottom-[calc(1.5rem+var(--v-dock,0px))] z-[110] mx-auto flex w-fit items-center gap-2 rounded-lg bg-[#17171a] px-3.5 py-2.5 text-sm font-medium text-white shadow-lg"
          >
            <Icon name="check" size={14} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

function MemberStatus({ status }: { status: string }) {
  const { t } = useTranslation('teams');
  const cls = status === 'ACTIVE' ? 'v-badge-success' : status === 'SUSPENDED' ? 'v-badge-danger' : 'v-badge-warning';
  return (
    <span className={`v-badge whitespace-nowrap ${cls}`}>
      {status === 'ACTIVE' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
      {t(`status.${status}`, status)}
    </span>
  );
}

/** Roles as a choice with what each can do, the same wording as the Roles view. */
function RolePicker({ value, onChange, allowOwner, disabled }: { value: Role; onChange: (r: Role) => void; allowOwner: boolean; disabled?: boolean }) {
  const { t } = useTranslation('teams');
  return (
    <div role="radiogroup" className="space-y-1.5">
      {ROLES.filter((r) => r !== 'OWNER' || allowOwner || value === 'OWNER').map((r) => {
        const checked = value === r;
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled || (r === 'OWNER' && !allowOwner)}
            onClick={() => !checked && onChange(r)}
            className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              checked ? 'bg-accent/[0.06] ring-1 ring-inset ring-accent/40' : 'ring-1 ring-inset ring-line hover:bg-elevated'
            }`}
          >
            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${checked ? 'bg-accent ring-accent' : 'ring-[hsl(var(--v-border-strong))]'}`}>
              {checked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{t(`roles.${r}.name`)}</span>
              <span className="block text-xs leading-relaxed text-faint">{t(`roles.${r}.summary`)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MemberDetails({
  member,
  me,
  teams,
  cards,
  chips,
  canManage,
  error,
  onClose,
  onRole,
  onTeam,
  onStatus,
  onRemove,
}: {
  member: MemberRow | null;
  me: Me | null;
  teams: TeamRow[];
  cards: Card[];
  chips: number;
  canManage: boolean;
  error: string;
  onClose: () => void;
  onRole: (r: Role) => void;
  onTeam: (teamId: string) => void;
  onStatus: (s: 'ACTIVE' | 'SUSPENDED') => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation('teams');
  const { locale } = useLocale();
  const self = member?.user.id === me?.id;
  // The API keeps owners with owners: only an owner edits one, and nobody edits themselves here.
  const editable = !!member && canManage && !self && (member.role !== 'OWNER' || me?.role === 'OWNER');

  return (
    <Sheet
      open={member !== null}
      onClose={onClose}
      closeLabel={t('actions.close')}
      title={
        member && (
          <span className="flex items-center gap-3">
            <Avatar user={member.user} size={36} />
            <span className="min-w-0">
              <span className="block truncate">{personName(member)}</span>
              {member.user.name && (
                <span dir="ltr" className="block truncate text-start text-xs font-normal text-faint rtl:text-right">
                  {member.user.email}
                </span>
              )}
            </span>
          </span>
        )
      }
      footer={
        member &&
        editable && (
          <div className="flex items-center gap-2">
            {member.role !== 'OWNER' && (
              <button onClick={() => onStatus(member.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED')} className="v-btn v-btn-ghost">
                <Icon name={member.status === 'SUSPENDED' ? 'check' : 'lock'} size={14} />
                {member.status === 'SUSPENDED' ? t('actions.reactivate') : t('actions.suspend')}
              </button>
            )}
            <button onClick={onRemove} className="v-btn v-btn-ghost ms-auto !text-red-600 dark:!text-red-400">
              <Icon name="trash" size={14} /> {t('actions.remove')}
            </button>
          </div>
        )
      }
    >
      {member && (
        <div className="space-y-5">
          {error && (
            <p role="alert" className="rounded-lg bg-red-500/[0.06] px-3 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
            <MemberStatus status={member.status} />
            {member.createdAt && <span>{t(member.status === 'INVITED' ? 'details.invited' : 'details.joined', { when: formatRelativeTime(member.createdAt, locale) })}</span>}
          </div>
          {member.status === 'INVITED' && <p className="text-xs leading-relaxed text-muted">{t('details.invitedNote')}</p>}
          {member.status === 'SUSPENDED' && <p className="text-xs leading-relaxed text-muted">{t('details.suspendedNote')}</p>}
          {self && <p className="text-xs leading-relaxed text-muted">{t('details.selfNote')}</p>}

          <div>
            <p className="mb-1.5 text-xs text-muted">{t('details.role')}</p>
            <RolePicker value={member.role} onChange={onRole} allowOwner={me?.role === 'OWNER'} disabled={!editable} />
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">{t('details.team')}</span>
            <select className="v-field" value={member.teamId ?? ''} onChange={(e) => onTeam(e.target.value)} disabled={!canManage}>
              <option value="">{t('details.noTeam')}</option>
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="mb-1.5 flex items-baseline gap-2 text-xs text-muted">
              {t('details.cards')}
              <span className="tabular text-faint">{formatNumber(cards.length, locale)}</span>
            </p>
            {cards.length === 0 ? (
              <p className="text-sm text-faint">{t('details.noCards')}</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg ring-1 ring-inset ring-line">
                {cards.map((c) => (
                  <li key={c.id}>
                    <Link href={`/cards/${c.id}`} className="flex min-h-11 items-center gap-3 px-3 py-2 hover:bg-elevated">
                      <CardThumb card={c} />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{((c.vcardData?.fullName as string) || '').trim() || `/c/${c.slug}`}</span>
                      <span className={`v-badge ${c.isPublished ? 'v-badge-success' : 'v-badge-neutral'}`}>{c.isPublished ? t('details.live') : t('details.draft')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="flex items-center justify-between text-sm">
            <span className="text-muted">{t('details.chips')}</span>
            <Link href="/tags" className="v-hit tabular font-medium text-accent hover:underline">
              {formatNumber(chips, locale)}
            </Link>
          </p>
        </div>
      )}
    </Sheet>
  );
}

function InvitePeople({ open, onClose, teams, myRole, onInvited }: { open: boolean; onClose: () => void; teams: TeamRow[]; myRole?: Role; onInvited: () => void }) {
  const { t } = useTranslation('teams');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('EMPLOYEE');
  const [teamId, setTeamId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string; upgrade?: boolean } | null>(null);
  // Every seat taken: say so before the form is filled in, not after.
  const [full, setFull] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    authFetch<UsageSummary>('/billing/subscription')
      .then((u) => {
        const limit = u.limits.members;
        setFull(limit !== null && u.usage.members >= limit ? new PlanLimitError({ resource: 'members', limit, plan: u.plan }).message : null);
      })
      .catch(() => setFull(null));
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await inviteMember({ email: email.trim(), name: name.trim() || undefined, role, teamId: teamId || undefined });
      // The membership exists either way; a failed email only needs a retry.
      setResult(res.emailSent ? { tone: 'ok', text: t('invite.sent', { email: email.trim() }) } : { tone: 'warn', text: t('invite.emailFailed', { email: email.trim() }) });
      setEmail('');
      setName('');
      onInvited();
    } catch (err) {
      setResult({ tone: 'error', text: (err as Error).message, upgrade: err instanceof PlanLimitError });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} closeLabel={t('actions.close')} title={t('invite.title')} subtitle={t('invite.subtitle')}>
      <form onSubmit={submit} className="space-y-4">
        {full && <PlanLimitNotice text={full} />}
        <label className="block">
          <span className="mb-1.5 block text-xs text-muted">{t('invite.email')}</span>
          <input type="email" dir="ltr" required className="v-field rtl:text-right" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-muted">
            {t('invite.name')} <span className="text-faint">· {t('invite.optional')}</span>
          </span>
          <input className="v-field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div>
          <p className="mb-1.5 text-xs text-muted">{t('details.role')}</p>
          <RolePicker value={role} onChange={setRole} allowOwner={myRole === 'OWNER'} />
        </div>
        {teams.length > 0 && (
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">{t('details.team')}</span>
            <select className="v-field" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">{t('details.noTeam')}</option>
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button disabled={busy || !email.trim() || !!full} className="v-btn w-full disabled:opacity-60">
          {busy ? t('invite.sending') : t('invite.send')}
        </button>
        {result?.upgrade ? <PlanLimitNotice text={result.text} /> : result && (
          <p
            role={result.tone === 'error' ? 'alert' : 'status'}
            className={`rounded-lg px-3 py-2.5 text-sm ring-1 ring-inset ${
              result.tone === 'ok'
                ? 'bg-emerald-500/[0.06] text-emerald-800 ring-emerald-500/20 dark:text-emerald-300'
                : result.tone === 'warn'
                  ? 'bg-amber-500/[0.06] text-amber-800 ring-amber-500/25 dark:text-amber-300'
                  : 'bg-red-500/[0.06] text-red-700 ring-red-500/20 dark:text-red-300'
            }`}
          >
            {result.text}
          </p>
        )}
      </form>
    </Sheet>
  );
}

/** The plan is full: what that means, and the way to more room. */
function PlanLimitNotice({ text }: { text: string }) {
  const { t } = useTranslation('common');
  return (
    <div role="alert" className="rounded-lg bg-amber-500/[0.06] px-3 py-2.5 text-sm text-amber-800 ring-1 ring-inset ring-amber-500/25 dark:text-amber-300">
      <p>{text}</p>
      <Link href="/billing" className="mt-1.5 inline-flex min-h-11 items-center font-medium text-ink underline-offset-2 hover:underline sm:min-h-0">
        {t('planLimit.upgrade')}
      </Link>
    </div>
  );
}
