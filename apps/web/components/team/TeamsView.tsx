'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch, type Member } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Sheet } from '@/components/ui/Sheet';

type Person = { id: string; name: string | null; email: string; avatarUrl?: string | null };

/** A team as /orgs/teams returns it, with its real activity counts. */
export interface TeamRow {
  id: string;
  name: string;
  color: string | null;
  managerId: string | null;
  departmentId: string | null;
  manager: Person | null;
  department: { id: string; name: string } | null;
  memberships: { id: string; user: Person }[];
  _count: { memberships: number };
  views?: number;
  leads?: number;
  completedTasks?: number;
  totalTasks?: number;
}

export interface Department {
  id: string;
  name: string;
  managerId: string | null;
  manager: Person | null;
  _count: { teams: number; memberships: number };
}

const personName = (p: Person) => p.name?.trim() || p.email;

/**
 * Teams, grouped under their departments. A team opens in a panel to rename
 * it, move it, set who leads it and choose its people.
 */
export function TeamsView({
  teams,
  departments,
  members,
  canManage,
  focusTeam,
  focusDepartment,
  onFocusHandled,
  onChanged,
  onDone,
  onOpenMember,
}: {
  teams: TeamRow[];
  departments: Department[];
  members: Member[];
  canManage: boolean;
  focusTeam: string | null;
  focusDepartment: string | null;
  onFocusHandled: () => void;
  onChanged: () => Promise<void>;
  onDone: (msg: string) => void;
  onOpenMember: (membershipId: string) => void;
}) {
  const { t } = useTranslation('teams');
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);

  const [openTeam, setOpenTeam] = useState<string | 'new' | null>(null);
  const [openDept, setOpenDept] = useState<string | 'new' | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<TeamRow | null>(null);
  const [deletingDept, setDeletingDept] = useState<Department | null>(null);

  // A link to one team or department opens it once the list is here.
  useEffect(() => {
    if (focusTeam && teams.some((tm) => tm.id === focusTeam)) {
      setOpenTeam(focusTeam);
      onFocusHandled();
    } else if (focusDepartment && departments.some((d) => d.id === focusDepartment)) {
      setOpenDept(focusDepartment);
      onFocusHandled();
    }
  }, [focusTeam, focusDepartment, teams, departments, onFocusHandled]);

  const groups = useMemo(() => {
    const byDept = departments.map((d) => ({ dept: d as Department | null, teams: teams.filter((tm) => tm.departmentId === d.id) }));
    const loose = teams.filter((tm) => !tm.departmentId || !departments.some((d) => d.id === tm.departmentId));
    return [...byDept, ...(loose.length || !departments.length ? [{ dept: null, teams: loose }] : [])];
  }, [teams, departments]);

  const team = teams.find((tm) => tm.id === openTeam) ?? null;
  const dept = departments.find((d) => d.id === openDept) ?? null;

  return (
    <div className="mt-4 space-y-4">
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setOpenTeam('new')} className="v-btn v-btn-ghost">
            <Icon name="plus" size={14} /> {t('teams.newTeam')}
          </button>
          <button onClick={() => setOpenDept('new')} className="v-btn v-btn-ghost">
            <Icon name="plus" size={14} /> {t('teams.newDepartment')}
          </button>
        </div>
      )}

      {teams.length === 0 && departments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-ink">{t('teams.emptyTitle')}</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{t('teams.emptyBody')}</p>
        </div>
      ) : (
        groups.map(({ dept: d, teams: list }) => (
          <section key={d?.id ?? 'none'} className="v-card overflow-hidden">
            <header className="flex items-center gap-2 border-b border-line px-4 py-3">
              <h2 className="truncate text-[14px] font-semibold text-ink">{d ? d.name : departments.length ? t('teams.noDepartment') : t('teams.allTeams')}</h2>
              {d && (
                <span className="tabular shrink-0 text-[12.5px] text-faint">
                  {t('teams.teamsCount', { count: list.length, value: fmt(list.length) })}
                  {' · '}
                  {(() => {
                    const people = list.reduce((sum, tm) => sum + tm._count.memberships, 0);
                    return t('teams.people', { count: people, value: fmt(people) });
                  })()}
                </span>
              )}
              {d?.manager && <span className="hidden truncate text-[12.5px] text-faint sm:inline">· {t('teams.ledBy', { name: personName(d.manager) })}</span>}
              {d && canManage && (
                <span className="ms-auto">
                  <ActionMenu
                    label={t('actions.more')}
                    items={[
                      { key: 'edit', label: t('teams.editDepartment'), icon: 'settings', onSelect: () => setOpenDept(d.id) },
                      { key: 'delete', label: t('teams.deleteDepartment'), icon: 'trash', danger: true, separated: true, onSelect: () => setDeletingDept(d) },
                    ]}
                  />
                </span>
              )}
            </header>
            {list.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-faint">{t('teams.deptEmpty')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((tm) => (
                  <li key={tm.id}>
                    <button onClick={() => setOpenTeam(tm.id)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-elevated">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tm.color || 'hsl(var(--v-faint))' }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink">{tm.name}</span>
                        <span className="block truncate text-[12px] text-faint">
                          {tm.manager ? t('teams.ledBy', { name: personName(tm.manager) }) : t('teams.noLead')}
                        </span>
                      </span>
                      <span className="hidden items-center -space-x-1.5 sm:flex rtl:space-x-reverse" aria-hidden>
                        {tm.memberships.slice(0, 4).map((m) => (
                          <Avatar key={m.id} user={m.user} size={24} ring />
                        ))}
                      </span>
                      <span className="tabular w-20 shrink-0 text-end text-[12.5px] text-muted">{t('teams.people', { count: tm._count.memberships, value: fmt(tm._count.memberships) })}</span>
                      <span className="tabular hidden w-24 shrink-0 text-end text-[12.5px] text-muted md:block">{t('teams.leads', { count: tm.leads ?? 0, value: fmt(tm.leads ?? 0) })}</span>
                      <Icon name="chevron-down" size={14} className="shrink-0 -rotate-90 text-faint rtl:rotate-90" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}

      <TeamSheet
        open={openTeam !== null}
        team={openTeam === 'new' ? null : team}
        departments={departments}
        members={members}
        canManage={canManage}
        onClose={() => setOpenTeam(null)}
        onSaved={async (msg, createdId) => {
          await onChanged();
          onDone(msg);
          if (createdId) setOpenTeam(createdId);
        }}
        onDelete={(tm) => setDeletingTeam(tm)}
        onOpenMember={(id) => {
          // One panel at a time: the person replaces the team.
          setOpenTeam(null);
          onOpenMember(id);
        }}
      />

      <DepartmentSheet
        open={openDept !== null}
        department={openDept === 'new' ? null : dept}
        members={members}
        onClose={() => setOpenDept(null)}
        onSaved={async (msg) => {
          await onChanged();
          onDone(msg);
          setOpenDept(null);
        }}
      />

      <ConfirmDialog
        open={deletingTeam !== null}
        title={deletingTeam ? t('teams.deleteTeamTitle', { name: deletingTeam.name }) : ''}
        body={t('teams.deleteTeamBody')}
        confirmLabel={t('actions.delete')}
        busyLabel={t('actions.deleting')}
        cancelLabel={t('actions.cancel')}
        danger
        onConfirm={async () => {
          if (!deletingTeam) return;
          await authFetch(`/orgs/teams/${deletingTeam.id}`, { method: 'DELETE' });
          setDeletingTeam(null);
          setOpenTeam(null);
          await onChanged();
          onDone(t('toasts.teamDeleted'));
        }}
        onCancel={() => setDeletingTeam(null)}
      />

      <ConfirmDialog
        open={deletingDept !== null}
        title={deletingDept ? t('teams.deleteDeptTitle', { name: deletingDept.name }) : ''}
        body={t('teams.deleteDeptBody')}
        confirmLabel={t('actions.delete')}
        busyLabel={t('actions.deleting')}
        cancelLabel={t('actions.cancel')}
        danger
        onConfirm={async () => {
          if (!deletingDept) return;
          await authFetch(`/orgs/departments/${deletingDept.id}`, { method: 'DELETE' });
          setDeletingDept(null);
          await onChanged();
          onDone(t('toasts.departmentDeleted'));
        }}
        onCancel={() => setDeletingDept(null)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] text-muted">{label}</span>
      {children}
    </label>
  );
}

/** Create a team, or look after one: its name, department, lead and people. */
function TeamSheet({
  open,
  team,
  departments,
  members,
  canManage,
  onClose,
  onSaved,
  onDelete,
  onOpenMember,
}: {
  open: boolean;
  team: TeamRow | null;
  departments: Department[];
  members: Member[];
  canManage: boolean;
  onClose: () => void;
  onSaved: (msg: string, createdId?: string) => Promise<void>;
  onDelete: (tm: TeamRow) => void;
  onOpenMember: (membershipId: string) => void;
}) {
  const { t } = useTranslation('teams');
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(team?.name ?? '');
    setDepartmentId(team?.departmentId ?? '');
    setManagerId(team?.managerId ?? '');
    setAdding('');
    setError('');
  }, [open, team]);

  const inTeam = team ? members.filter((m) => m.teamId === team.id) : [];
  const others = team ? members.filter((m) => m.teamId !== team.id) : [];

  async function run(fn: () => Promise<unknown>, msg: string, createdId?: (res: unknown) => string | undefined) {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      await onSaved(msg, createdId?.(res));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const patch = (body: Record<string, unknown>, msg: string) =>
    team && run(() => authFetch(`/orgs/teams/${team.id}`, { method: 'PATCH', body: JSON.stringify(body) }), msg);
  const setMemberTeam = (membershipId: string, teamId: string | null, msg: string) =>
    run(() => authFetch(`/orgs/members/${membershipId}`, { method: 'PATCH', body: JSON.stringify({ teamId }) }), msg);

  const deptOptions = (
    <>
      <option value="">{t('teams.noDepartment')}</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </>
  );
  const leadOptions = (
    <>
      <option value="">{t('teams.noLead')}</option>
      {members.map((m) => (
        <option key={m.user.id} value={m.user.id}>
          {personName(m.user)}
        </option>
      ))}
    </>
  );

  // Creating a team: three fields and a button.
  if (!team) {
    return (
      <Sheet open={open} onClose={onClose} closeLabel={t('actions.close')} title={t('teams.newTeam')}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            run(
              () =>
                authFetch<{ id: string }>('/orgs/teams', {
                  method: 'POST',
                  body: JSON.stringify({ name: name.trim(), departmentId: departmentId || undefined, managerId: managerId || undefined }),
                }),
              t('toasts.teamCreated', { name: name.trim() }),
              (res) => (res as { id?: string })?.id,
            );
          }}
          className="space-y-4"
        >
          <Field label={t('teams.name')}>
            <input className="v-field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('teams.namePlaceholder')} required autoFocus />
          </Field>
          {departments.length > 0 && (
            <Field label={t('teams.department')}>
              <select className="v-field" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                {deptOptions}
              </select>
            </Field>
          )}
          <Field label={t('teams.lead')}>
            <select className="v-field" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              {leadOptions}
            </select>
          </Field>
          {error && <p role="alert" className="text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}
          <button disabled={busy || !name.trim()} className="v-btn w-full disabled:opacity-60">
            {busy ? t('actions.saving') : t('teams.create')}
          </button>
        </form>
      </Sheet>
    );
  }

  const tasksLabel = team.totalTasks ? t('teams.tasksValue', { done: fmt(team.completedTasks ?? 0), total: fmt(team.totalTasks) }) : '—';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={t('actions.close')}
      title={
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: team.color || 'hsl(var(--v-faint))' }} aria-hidden />
          <span className="truncate">{team.name}</span>
        </span>
      }
      subtitle={team.department?.name ?? t('teams.noDepartment')}
      footer={
        canManage && (
          <button onClick={() => onDelete(team)} className="v-btn v-btn-ghost ms-auto flex !text-red-600 dark:!text-red-400">
            <Icon name="trash" size={14} /> {t('teams.deleteTeam')}
          </button>
        )
      }
    >
      <div className="space-y-5">
        {error && (
          <p role="alert" className="rounded-lg bg-red-500/[0.06] px-3 py-2.5 text-[13px] text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-line ring-1 ring-line">
          {[
            { label: t('teams.viewsLabel'), value: fmt(team.views ?? 0) },
            { label: t('teams.leadsLabel'), value: fmt(team.leads ?? 0) },
            { label: t('teams.tasksLabel'), value: tasksLabel },
          ].map((s) => (
            <div key={s.label} className="bg-surface px-3 py-2.5">
              <p className="text-[12px] text-faint">{s.label}</p>
              <p className="tabular mt-0.5 text-[15px] font-medium text-ink">{s.value}</p>
            </div>
          ))}
        </div>
        <p className="-mt-3 text-[12px] leading-relaxed text-faint">{t('teams.statsNote')}</p>

        {canManage && (
          <>
            <Field label={t('teams.name')}>
              <input
                className="v-field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name.trim() && name.trim() !== team.name && patch({ name: name.trim() }, t('toasts.teamRenamed'))}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('teams.department')}>
                <select
                  className="v-field"
                  value={departmentId}
                  onChange={(e) => {
                    setDepartmentId(e.target.value);
                    patch({ departmentId: e.target.value || null }, t('toasts.teamMoved'));
                  }}
                >
                  {deptOptions}
                </select>
              </Field>
              <Field label={t('teams.lead')}>
                <select
                  className="v-field"
                  value={managerId}
                  onChange={(e) => {
                    setManagerId(e.target.value);
                    patch({ managerId: e.target.value || null }, t('toasts.teamLeadUpdated'));
                  }}
                >
                  {leadOptions}
                </select>
              </Field>
            </div>
          </>
        )}

        <div>
          <p className="mb-1.5 flex items-baseline gap-2 text-[12.5px] text-muted">
            {t('teams.members')}
            <span className="tabular text-faint">{fmt(inTeam.length)}</span>
          </p>
          {inTeam.length === 0 ? (
            <p className="text-[13px] text-faint">{t('teams.noMembers')}</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg ring-1 ring-inset ring-line">
              {inTeam.map((m) => (
                <li key={m.id} className="flex items-center gap-2 pe-1.5">
                  <button onClick={() => onOpenMember(m.id)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-start hover:bg-elevated">
                    <Avatar user={m.user} size={26} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{personName(m.user)}</span>
                    <span className="shrink-0 text-[12px] text-faint">{t(`roles.${m.role}.name`)}</span>
                  </button>
                  {canManage && (
                    <button
                      onClick={() => setMemberTeam(m.id, null, t('toasts.removedFromTeam', { name: personName(m.user) }))}
                      disabled={busy}
                      aria-label={t('teams.removeFromTeam', { name: personName(m.user) })}
                      title={t('teams.removeFromTeam', { name: personName(m.user) })}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-faint hover:bg-elevated hover:text-ink sm:h-8 sm:w-8"
                    >
                      <Icon name="x" size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManage && others.length > 0 && (
            <div className="mt-2 flex gap-2">
              <select className="v-field min-w-0 flex-1" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label={t('teams.addPerson')}>
                <option value="">{t('teams.addPerson')}</option>
                {others.map((m) => (
                  <option key={m.id} value={m.id}>
                    {personName(m.user)}
                    {m.team ? ` (${m.team.name})` : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={() => adding && setMemberTeam(adding, team.id, t('toasts.addedToTeam'))}
                disabled={!adding || busy}
                className="v-btn v-btn-ghost shrink-0 disabled:opacity-50"
              >
                {t('teams.add')}
              </button>
            </div>
          )}
          {canManage && others.length > 0 && <p className="mt-1.5 text-[12px] text-faint">{t('teams.moveNote')}</p>}
        </div>
      </div>
    </Sheet>
  );
}

function DepartmentSheet({
  open,
  department,
  members,
  onClose,
  onSaved,
}: {
  open: boolean;
  department: Department | null;
  members: Member[];
  onClose: () => void;
  onSaved: (msg: string) => Promise<void>;
}) {
  const { t } = useTranslation('teams');
  const [name, setName] = useState('');
  const [managerId, setManagerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(department?.name ?? '');
    setManagerId(department?.managerId ?? '');
    setError('');
  }, [open, department]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      if (department) {
        await authFetch(`/orgs/departments/${department.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim(), managerId: managerId || null }) });
        await onSaved(t('toasts.departmentSaved'));
      } else {
        await authFetch('/orgs/departments', { method: 'POST', body: JSON.stringify({ name: name.trim(), managerId: managerId || undefined }) });
        await onSaved(t('toasts.departmentCreated', { name: name.trim() }));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} closeLabel={t('actions.close')} title={department ? t('teams.editDepartment') : t('teams.newDepartment')} subtitle={t('teams.departmentHint')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('teams.name')}>
          <input className="v-field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('teams.deptPlaceholder')} required autoFocus />
        </Field>
        <Field label={t('teams.lead')}>
          <select className="v-field" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="">{t('teams.noLead')}</option>
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {personName(m.user)}
              </option>
            ))}
          </select>
        </Field>
        {error && <p role="alert" className="text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}
        <button disabled={busy || !name.trim()} className="v-btn w-full disabled:opacity-60">
          {busy ? t('actions.saving') : department ? t('actions.save') : t('teams.createDepartment')}
        </button>
      </form>
    </Sheet>
  );
}
