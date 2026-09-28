'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { formatDate, formatNumber } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { OrgMark } from '@/components/OrgMark';
import { Sheet } from '@/components/ui/Sheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, PasswordField, Pills, SearchField, type AdminUser } from './shared';

type Filter = 'ALL' | 'ADMINS' | 'SUSPENDED';

/** Suspended means no workspace access left: every membership is suspended. */
const isSuspended = (u: AdminUser) => u.organizations.length > 0 && u.organizations.every((o) => o.status === 'SUSPENDED');

export function People({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation('admin');
  const { locale } = useLocale();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => authFetch<AdminUser[]>('/admin/users').then(setUsers), []);
  useEffect(() => {
    load().catch(() => setUsers([]));
  }, [load]);

  const needle = q.trim().toLowerCase();
  const shown = (users ?? []).filter(
    (u) =>
      (filter === 'ALL' || (filter === 'ADMINS' ? u.isSuperAdmin : isSuspended(u))) &&
      (!needle || u.email.toLowerCase().includes(needle) || u.name?.toLowerCase().includes(needle) || u.organizations.some((o) => o.name.toLowerCase().includes(needle))),
  );
  const open = users?.find((u) => u.id === openId) ?? null;
  const n = (v: number) => formatNumber(v, locale);

  return (
    <div className="max-w-[1180px]">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchField value={q} onChange={setQ} placeholder={t('people.searchPlaceholder')} className="lg:w-72" />
        <Pills
          label={t('people.all')}
          value={filter}
          onChange={setFilter}
          options={[
            { key: 'ALL' as Filter, label: t('people.all') },
            { key: 'ADMINS' as Filter, label: t('people.admins') },
            { key: 'SUSPENDED' as Filter, label: t('people.suspended') },
          ]}
        />
        <button onClick={() => setCreating(true)} className="v-btn shrink-0 lg:ms-auto">
          <Icon name="plus" size={14} /> {t('people.new')}
        </button>
      </div>

      {!users ? (
        <div className="v-skeleton h-72 rounded-xl" />
      ) : shown.length === 0 ? (
        <p className="rounded-xl py-14 text-center text-[13.5px] text-muted ring-1 ring-inset ring-line">{t('people.empty')}</p>
      ) : (
        <div className="v-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="v-table">
              <thead>
                <tr>
                  <th>{t('people.cols.person')}</th>
                  <th className="hidden md:table-cell">{t('people.cols.workspaces')}</th>
                  <th className="hidden !text-end sm:table-cell">{t('people.cols.cards')}</th>
                  <th className="hidden !text-end lg:table-cell">{t('people.cols.leads')}</th>
                  <th className="hidden lg:table-cell">{t('people.cols.joined')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr
                    key={u.id}
                    tabIndex={0}
                    onClick={() => setOpenId(u.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setOpenId(u.id)}
                    className={`cursor-pointer outline-none focus-visible:[&>td]:bg-elevated ${openId === u.id ? '[&>td]:!bg-accent/[0.06]' : ''}`}
                  >
                    <td className="w-full max-w-0">
                      <span className="flex items-center gap-3">
                        <Avatar user={u} size={32} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium text-ink">{u.name || u.email}</span>
                            {u.isSuperAdmin && <span className="v-badge v-badge-accent shrink-0">{t('people.admin')}</span>}
                            {isSuspended(u) && <span className="v-badge v-badge-warning shrink-0">{t('people.suspended')}</span>}
                          </span>
                          {u.name && (
                            <span dir="ltr" className="block truncate text-[12.5px] text-faint rtl:text-right">
                              {u.email}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="hidden max-w-[260px] md:table-cell">
                      {u.organizations.length === 0 ? (
                        <span className="text-[13px] text-faint">{t('people.noWorkspace')}</span>
                      ) : (
                        <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
                          <span className="truncate">
                            {u.organizations[0].name} · {t(`roles.${u.organizations[0].role}`, { defaultValue: u.organizations[0].role })}
                          </span>
                          {u.organizations.length > 1 && <span className="shrink-0 text-faint">{t('people.more', { count: u.organizations.length - 1 })}</span>}
                        </span>
                      )}
                    </td>
                    <td className="tabular hidden !text-end sm:table-cell">{n(u.cardsCount)}</td>
                    <td className="tabular hidden !text-end lg:table-cell">{n(u.leadsCount)}</td>
                    <td className="hidden whitespace-nowrap text-[13px] text-muted lg:table-cell">{formatDate(u.createdAt, locale, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PersonSheet
        user={open}
        onClose={() => setOpenId(null)}
        onChanged={() => {
          load();
          onChanged();
        }}
      />
      <NewPerson
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          load();
          onChanged();
        }}
      />
    </div>
  );
}

function PersonSheet({ user, onClose, onChanged }: { user: AdminUser | null; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation('admin');
  const { locale } = useLocale();
  const [last, setLast] = useState<AdminUser | null>(user);
  const [confirm, setConfirm] = useState<'SUSPENDED' | 'ACTIVE' | null>(null);
  useEffect(() => {
    if (user) setLast(user);
  }, [user]);

  const u = user ?? last;
  if (!u) return <Sheet open={false} onClose={onClose} title="" closeLabel={t('close')}>{null}</Sheet>;
  const suspended = isSuspended(u);
  const name = u.name || u.email;

  return (
    <>
      <Sheet
        open={!!user}
        onClose={onClose}
        closeLabel={t('close')}
        title={
          <span className="flex items-center gap-3">
            <Avatar user={u} size={32} />
            <span className="min-w-0 truncate">{name}</span>
          </span>
        }
        subtitle={
          <span dir="ltr" className="ms-11 block -mt-1 rtl:text-right">
            {u.email}
          </span>
        }
      >
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {u.isSuperAdmin && <span className="v-badge v-badge-accent">{t('people.admin')}</span>}
            {suspended && <span className="v-badge v-badge-warning">{t('people.suspended')}</span>}
            <span className="text-[12.5px] text-faint">
              {t('people.cols.joined')} {formatDate(u.createdAt, locale)}
            </span>
          </div>

          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-ink">{t('people.memberships')}</h3>
            {u.organizations.length === 0 ? (
              <p className="text-[13px] text-faint">{t('people.noWorkspace')}</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg ring-1 ring-inset ring-line">
                {u.organizations.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 px-3 py-2.5">
                    <OrgMark name={o.name} size={26} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{o.name}</span>
                    <span className="shrink-0 text-[12.5px] text-muted">{t(`roles.${o.role}`, { defaultValue: o.role })}</span>
                    {o.status !== 'ACTIVE' && <span className="v-badge v-badge-warning shrink-0">{t('people.suspended')}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-[13px] text-muted">
            {t('people.cols.cards')}: <span className="tabular text-ink">{formatNumber(u.cardsCount, locale)}</span> · {t('people.cols.leads')}:{' '}
            <span className="tabular text-ink">{formatNumber(u.leadsCount, locale)}</span>
          </p>

          {u.organizations.length > 0 && (
            <section className="border-t border-line pt-5">
              {suspended ? (
                <button onClick={() => setConfirm('ACTIVE')} className="v-btn">
                  {t('people.reactivateAll')}
                </button>
              ) : (
                <button onClick={() => setConfirm('SUSPENDED')} className="v-btn v-btn-ghost text-red-600 dark:text-red-400">
                  {t('people.suspendAll')}
                </button>
              )}
            </section>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!confirm}
        title={confirm === 'ACTIVE' ? t('people.reactivateTitle', { name }) : t('people.suspendTitle', { name })}
        body={confirm === 'ACTIVE' ? t('people.reactivateBody') : t('people.suspendBody')}
        confirmLabel={confirm === 'ACTIVE' ? t('people.reactivateAll') : t('people.suspendAll')}
        busyLabel={confirm === 'ACTIVE' ? t('people.reactivating') : t('people.suspending')}
        cancelLabel={t('cancel')}
        danger={confirm === 'SUSPENDED'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await authFetch(`/admin/users/${u.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: confirm }) });
          setConfirm(null);
          onChanged();
        }}
      />
    </>
  );
}

function NewPerson({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation('admin');
  const [f, setF] = useState({ name: '', email: '', password: '', workspace: '', superAdmin: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setF({ name: '', email: '', password: '', workspace: '', superAdmin: false });
    setErr('');
    setBusy(false);
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!f.email.trim()) return setErr(t('people.form.needEmail'));
    if (f.password.length < 8) return setErr(t('people.form.needPassword'));
    if (!f.workspace.trim()) return setErr(t('people.form.needWorkspace'));
    setBusy(true);
    try {
      await authFetch('/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: f.email.trim(), name: f.name.trim() || undefined, password: f.password, organizationName: f.workspace.trim(), isSuperAdmin: f.superAdmin }),
      });
      onCreated();
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={t('close')}
      title={t('people.new')}
      footer={
        <div className="flex items-center justify-end gap-2">
          {err && <p className="me-auto text-[12.5px] text-red-600 dark:text-red-400">{err}</p>}
          <button type="button" onClick={onClose} className="v-btn v-btn-ghost">
            {t('cancel')}
          </button>
          <button type="submit" form="new-person" disabled={busy} className="v-btn disabled:opacity-60">
            {busy ? t('saving') : t('people.form.create')}
          </button>
        </div>
      }
    >
      <form id="new-person" onSubmit={save} className="space-y-5">
        <Field label={t('people.form.name')} htmlFor="p-name">
          <input id="p-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="v-field w-full" />
        </Field>
        <Field label={t('people.form.email')} htmlFor="p-email">
          <input id="p-email" type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="v-field w-full rtl:text-right" />
        </Field>
        <Field label={t('people.form.password')} htmlFor="p-password" hint={t('workspaces.form.passwordHint')}>
          <PasswordField id="p-password" value={f.password} onChange={(v) => setF({ ...f, password: v })} />
        </Field>
        <Field label={t('people.form.workspace')} htmlFor="p-ws" hint={t('people.form.workspaceHint')}>
          <input id="p-ws" value={f.workspace} onChange={(e) => setF({ ...f, workspace: e.target.value })} maxLength={120} className="v-field w-full" />
        </Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg p-3 ring-1 ring-inset ring-line">
          <input type="checkbox" checked={f.superAdmin} onChange={(e) => setF({ ...f, superAdmin: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-accent" />
          <span>
            <span className="block text-[13px] font-medium text-ink">{t('people.form.superAdmin')}</span>
            <span className="mt-0.5 block text-[12.5px] leading-relaxed text-faint">{t('people.form.superAdminHint')}</span>
          </span>
        </label>
      </form>
    </Sheet>
  );
}
