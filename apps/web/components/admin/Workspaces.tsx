'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { formatDate, formatNumber } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { OrgMark } from '@/components/OrgMark';
import { Sheet } from '@/components/ui/Sheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Notice, PLANS, PLAN_BADGE, PasswordField, Pills, SearchField, type AdminOrg, type Plan } from './shared';

type Filter = 'ALL' | Plan;

export function Workspaces({ orgs, reload }: { orgs: AdminOrg[] | null; reload: () => Promise<void> }) {
  const { t } = useTranslation('admin');
  const { locale } = useLocale();
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState<Filter>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const needle = q.trim().toLowerCase();
  const shown = (orgs ?? []).filter(
    (o) =>
      (plan === 'ALL' || o.plan === plan) &&
      (!needle || o.name.toLowerCase().includes(needle) || o.slug.includes(needle) || o.owner?.email.toLowerCase().includes(needle) || o.owner?.name?.toLowerCase().includes(needle)),
  );
  const open = orgs?.find((o) => o.id === openId) ?? null;
  const n = (v: number) => formatNumber(v, locale);

  return (
    <div className="max-w-[1180px]">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchField value={q} onChange={setQ} placeholder={t('workspaces.searchPlaceholder')} className="lg:w-72" />
        <Pills
          label={t('workspaces.cols.plan')}
          value={plan}
          onChange={setPlan}
          options={[{ key: 'ALL' as Filter, label: t('workspaces.all') }, ...PLANS.map((p) => ({ key: p as Filter, label: t(`plans.${p}`) }))]}
        />
        <button onClick={() => setCreating(true)} className="v-btn shrink-0 lg:ms-auto">
          <Icon name="plus" size={14} /> {t('workspaces.new')}
        </button>
      </div>

      {!orgs ? (
        <div className="v-skeleton h-72 rounded-xl" />
      ) : shown.length === 0 ? (
        <p className="rounded-xl py-14 text-center text-[13.5px] text-muted ring-1 ring-inset ring-line">{t('workspaces.empty')}</p>
      ) : (
        <div className="v-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="v-table">
              <thead>
                <tr>
                  <th>{t('workspaces.cols.workspace')}</th>
                  <th className="hidden md:table-cell">{t('workspaces.cols.owner')}</th>
                  <th>{t('workspaces.cols.plan')}</th>
                  <th className="hidden !text-end sm:table-cell">{t('workspaces.cols.members')}</th>
                  <th className="hidden !text-end lg:table-cell">{t('workspaces.cols.cards')}</th>
                  <th className="hidden !text-end lg:table-cell">{t('workspaces.cols.chips')}</th>
                  <th className="hidden !text-end xl:table-cell">{t('workspaces.cols.leads')}</th>
                  <th className="hidden md:table-cell">{t('workspaces.cols.created')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => (
                  <tr
                    key={o.id}
                    tabIndex={0}
                    onClick={() => setOpenId(o.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setOpenId(o.id)}
                    className={`cursor-pointer outline-none focus-visible:[&>td]:bg-elevated ${openId === o.id ? '[&>td]:!bg-accent/[0.06]' : ''}`}
                  >
                    <td className="w-full max-w-0">
                      <span className="flex items-center gap-3">
                        <OrgMark name={o.name} size={30} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium text-ink">{o.name}</span>
                            {!o.isActive && <span className="v-badge v-badge-warning shrink-0">{t('workspaces.suspended')}</span>}
                          </span>
                          <span dir="ltr" className="block truncate font-mono text-[12px] text-faint rtl:text-right">
                            {o.slug}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="hidden max-w-[220px] md:table-cell">
                      {o.owner ? (
                        <span className="block truncate text-[13px] text-muted">{o.owner.name || o.owner.email}</span>
                      ) : (
                        <span className="text-[13px] text-faint">{t('workspaces.noOwner')}</span>
                      )}
                    </td>
                    <td>
                      <span className={`v-badge ${PLAN_BADGE[o.plan]}`}>{t(`plans.${o.plan}`)}</span>
                    </td>
                    <td className="tabular hidden !text-end sm:table-cell">{n(o.membersCount)}</td>
                    <td className="tabular hidden !text-end lg:table-cell">{n(o.cardsCount)}</td>
                    <td className="tabular hidden !text-end lg:table-cell">{n(o.nfcCount)}</td>
                    <td className="tabular hidden !text-end xl:table-cell">{n(o.leadsCount)}</td>
                    <td className="hidden whitespace-nowrap text-[13px] text-muted md:table-cell">{formatDate(o.createdAt, locale, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <WorkspaceSheet org={open} onClose={() => setOpenId(null)} reload={reload} />
      <NewWorkspace open={creating} onClose={() => setCreating(false)} onCreated={() => reload().then(() => setCreating(false))} />
    </div>
  );
}

function WorkspaceSheet({ org, onClose, reload }: { org: AdminOrg | null; onClose: () => void; reload: () => Promise<void> }) {
  const { t } = useTranslation('admin');
  const { locale } = useLocale();
  const [last, setLast] = useState<AdminOrg | null>(org);
  const [plan, setPlan] = useState<Plan>('FREE');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState<'suspend' | 'delete' | null>(null);
  const [owner, setOwner] = useState({ email: '', name: '', password: '' });
  const [ownerOpen, setOwnerOpen] = useState(false);

  useEffect(() => {
    if (!org) return;
    setLast(org);
    setPlan(org.plan);
  }, [org]);
  useEffect(() => {
    setMsg(null);
    setOwnerOpen(false);
    setOwner({ email: '', name: '', password: '' });
  }, [org?.id]);

  const o = org ?? last;
  if (!o) return <Sheet open={false} onClose={onClose} title="" closeLabel={t('close')}>{null}</Sheet>;
  const n = (v: number) => formatNumber(v, locale);

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      await reload();
      if (done) setMsg({ tone: 'success', text: done });
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as Error).message });
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <Sheet
        open={!!org}
        onClose={onClose}
        closeLabel={t('close')}
        title={
          <span className="flex items-center gap-3">
            <OrgMark name={o.name} size={30} />
            <span className="min-w-0 truncate">{o.name}</span>
          </span>
        }
        subtitle={
          <span dir="ltr" className="ms-[42px] block -mt-1 font-mono rtl:text-right">
            {o.slug}
          </span>
        }
      >
        <div className="space-y-6">
          {msg && (
            <Notice tone={msg.tone} onDismiss={() => setMsg(null)}>
              {msg.text}
            </Notice>
          )}
          <p className="text-[13px] text-muted">{t('workspaces.counts', { members: n(o.membersCount), cards: n(o.cardsCount), chips: n(o.nfcCount), leads: n(o.leadsCount) })}</p>

          <Section title={t('workspaces.status')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[13px] text-ink">
                <span className={`h-2 w-2 rounded-full ${o.isActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {o.isActive ? t('workspaces.active') : t('workspaces.suspended')}
              </span>
              {o.isActive ? (
                <button onClick={() => setConfirm('suspend')} className="v-btn v-btn-ghost">
                  {t('workspaces.suspend')}
                </button>
              ) : (
                <button
                  onClick={() => run('status', () => authFetch(`/admin/organizations/${o.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: true }) }))}
                  disabled={!!busy}
                  className="v-btn disabled:opacity-60"
                >
                  {t('workspaces.reactivate')}
                </button>
              )}
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-faint">{o.isActive ? t('workspaces.statusActive') : t('workspaces.statusSuspended')}</p>
          </Section>

          <Section title={t('workspaces.plan')}>
            <div className="flex gap-2">
              <select value={plan} onChange={(e) => setPlan(e.target.value as Plan)} aria-label={t('workspaces.plan')} className="v-field min-w-0 flex-1">
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {t(`plans.${p}`)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => run('plan', () => authFetch(`/admin/organizations/${o.id}/plan`, { method: 'PATCH', body: JSON.stringify({ plan }) }), t('workspaces.planSaved'))}
                disabled={plan === o.plan || !!busy}
                className="v-btn shrink-0 disabled:opacity-50"
              >
                {busy === 'plan' ? t('saving') : t('save')}
              </button>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-faint">{t('workspaces.planHint')}</p>
          </Section>

          <Section title={t('workspaces.owner')}>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                {o.owner ? (
                  <>
                    <span className="block truncate text-[13.5px] font-medium text-ink">{o.owner.name || o.owner.email}</span>
                    {o.owner.name && (
                      <span dir="ltr" className="block truncate text-[12.5px] text-faint rtl:text-right">
                        {o.owner.email}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[13px] text-faint">{t('workspaces.noOwner')}</span>
                )}
              </span>
              {!ownerOpen && (
                <button onClick={() => setOwnerOpen(true)} className="v-btn v-btn-ghost shrink-0">
                  {t('workspaces.changeOwner')}
                </button>
              )}
            </div>
            {ownerOpen && (
              <form
                className="mt-4 space-y-3 rounded-lg p-4 ring-1 ring-inset ring-line"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!owner.email.trim()) return;
                  run(
                    'owner',
                    () =>
                      authFetch(`/admin/organizations/${o.id}/owner`, {
                        method: 'PATCH',
                        body: JSON.stringify({ ownerEmail: owner.email.trim(), ownerName: owner.name.trim() || undefined, ownerPassword: owner.password || undefined }),
                      }),
                    t('workspaces.ownerSaved'),
                  ).then(() => setOwnerOpen(false));
                }}
              >
                <Field label={t('workspaces.ownerEmail')} htmlFor="owner-email" hint={t('workspaces.ownerHint')}>
                  <input id="owner-email" type="email" dir="ltr" required value={owner.email} onChange={(e) => setOwner({ ...owner, email: e.target.value })} className="v-field w-full rtl:text-right" />
                </Field>
                <Field label={t('workspaces.form.personName')} htmlFor="owner-name">
                  <input id="owner-name" value={owner.name} onChange={(e) => setOwner({ ...owner, name: e.target.value })} className="v-field w-full" />
                </Field>
                <Field label={t('workspaces.form.password')} htmlFor="owner-password">
                  <PasswordField id="owner-password" value={owner.password} onChange={(v) => setOwner({ ...owner, password: v })} />
                </Field>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setOwnerOpen(false)} className="v-btn v-btn-ghost">
                    {t('cancel')}
                  </button>
                  <button disabled={!!busy} className="v-btn disabled:opacity-60">
                    {busy === 'owner' ? t('saving') : t('workspaces.changeOwner')}
                  </button>
                </div>
              </form>
            )}
          </Section>

          <Section title={t('workspaces.danger')}>
            <button onClick={() => setConfirm('delete')} className="v-btn v-btn-ghost text-red-600 dark:text-red-400">
              <Icon name="trash" size={14} /> {t('workspaces.delete')}
            </button>
          </Section>

          <p className="text-[12px] text-faint">{formatDate(o.createdAt, locale)}</p>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirm === 'suspend'}
        title={t('workspaces.suspendTitle', { name: o.name })}
        body={t('workspaces.suspendBody')}
        confirmLabel={t('workspaces.suspend')}
        busyLabel={t('workspaces.suspending')}
        cancelLabel={t('cancel')}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await authFetch(`/admin/organizations/${o.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) });
          setConfirm(null);
          await reload();
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title={t('workspaces.deleteTitle', { name: o.name })}
        body={t('workspaces.deleteBody')}
        confirmLabel={t('workspaces.delete')}
        busyLabel={t('workspaces.deleting')}
        cancelLabel={t('cancel')}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await authFetch(`/admin/organizations/${o.id}`, { method: 'DELETE' });
          setConfirm(null);
          onClose();
          await reload();
        }}
      />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-5">
      <h3 className="mb-3 text-[13px] font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function NewWorkspace({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation('admin');
  const [f, setF] = useState({ name: '', plan: 'FREE' as Plan, who: 'existing' as 'existing' | 'new', email: '', ownerName: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setF({ name: '', plan: 'FREE', who: 'existing', email: '', ownerName: '', password: '' });
    setErr('');
    setBusy(false);
  }, [open]);

  const valid = useMemo(() => ({ name: !!f.name.trim(), email: !!f.email.trim(), password: f.who === 'existing' || f.password.length >= 8 }), [f]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!valid.name) return setErr(t('workspaces.form.needName'));
    if (!valid.email) return setErr(t('workspaces.form.needEmail'));
    if (!valid.password) return setErr(t('workspaces.form.needPassword'));
    setBusy(true);
    try {
      await authFetch('/admin/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: f.name.trim(),
          plan: f.plan,
          ownerEmail: f.email.trim(),
          ...(f.who === 'new' ? { ownerName: f.ownerName.trim() || undefined, ownerPassword: f.password } : {}),
        }),
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
      title={t('workspaces.new')}
      footer={
        <div className="flex items-center justify-end gap-2">
          {err && <p className="me-auto text-[12.5px] text-red-600 dark:text-red-400">{err}</p>}
          <button type="button" onClick={onClose} className="v-btn v-btn-ghost">
            {t('cancel')}
          </button>
          <button type="submit" form="new-workspace" disabled={busy} className="v-btn disabled:opacity-60">
            {busy ? t('saving') : t('workspaces.form.create')}
          </button>
        </div>
      }
    >
      <form id="new-workspace" onSubmit={save} className="space-y-5">
        <Field label={t('workspaces.form.name')} htmlFor="ws-name">
          <input id="ws-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} className="v-field w-full" />
        </Field>
        <Field label={t('workspaces.plan')} htmlFor="ws-plan">
          <select id="ws-plan" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value as Plan })} className="v-field w-full">
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {t(`plans.${p}`)}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <p className="mb-1.5 text-[12.5px] font-medium text-ink">{t('workspaces.form.ownerChoice')}</p>
          <div role="radiogroup" className="grid grid-cols-2 rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
            {(['existing', 'new'] as const).map((w) => (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={f.who === w}
                onClick={() => setF({ ...f, who: w })}
                className={`h-9 rounded-md text-[13px] font-medium sm:h-8 ${f.who === w ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'}`}
              >
                {w === 'existing' ? t('workspaces.form.existing') : t('workspaces.form.newPerson')}
              </button>
            ))}
          </div>
        </div>
        <Field label={t('workspaces.form.email')} htmlFor="ws-email">
          <input id="ws-email" type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="v-field w-full rtl:text-right" />
        </Field>
        {f.who === 'new' && (
          <>
            <Field label={t('workspaces.form.personName')} htmlFor="ws-owner-name">
              <input id="ws-owner-name" value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} className="v-field w-full" />
            </Field>
            <Field label={t('workspaces.form.password')} htmlFor="ws-password" hint={t('workspaces.form.passwordHint')}>
              <PasswordField id="ws-password" value={f.password} onChange={(v) => setF({ ...f, password: v })} />
            </Field>
          </>
        )}
      </form>
    </Sheet>
  );
}
