'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_ROLE_BASES, PERMISSION_AREAS, roleCapabilities, type CustomRoleBase, type CustomRoleView, type PermissionLevel } from '@vertex/shared';
import { authFetch } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';

type Draft = { id?: string; name: string; description: string; base: CustomRoleBase; capabilities: string[] };
const blank = (base: CustomRoleBase = 'EMPLOYEE'): Draft => ({ name: '', description: '', base, capabilities: roleCapabilities(base) });

/** The level a set of capabilities gives in an area. */
const levelIn = (caps: string[], area: string): PermissionLevel | null => (caps.includes(`${area}:full`) ? 'full' : caps.includes(`${area}:basic`) ? 'basic' : null);

/**
 * The workspace's own roles: a base role (what data its holders see) and a
 * level per area (what they can change). Built-in owners and admins make,
 * change and delete them; everyone who can see the team sees what each allows.
 */
export function CustomRoles({ roles, canEdit, onChanged }: { roles: CustomRoleView[] | null; canEdit: boolean; onChanged: () => void }) {
  const { t } = useTranslation('teams');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setLevel = (area: string, level: PermissionLevel | null) =>
    draft && setDraft({ ...draft, capabilities: [...draft.capabilities.filter((c) => !c.startsWith(`${area}:`)), ...(level ? [`${area}:${level}`] : [])] });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const body = JSON.stringify({ name: draft.name.trim(), description: draft.description.trim(), base: draft.base, capabilities: draft.capabilities });
      await authFetch(draft.id ? `/orgs/roles/${draft.id}` : '/orgs/roles', { method: draft.id ? 'PATCH' : 'POST', body });
      setDraft(null);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: CustomRoleView) {
    if (!window.confirm(t('customRoles.confirmDelete', { name: r.name, count: r.members }))) return;
    try {
      await authFetch(`/orgs/roles/${r.id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="space-y-3" data-testid="custom-roles">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-ink">{t('customRoles.title')}</h2>
          <p className="mt-0.5 max-w-[640px] text-xs leading-relaxed text-muted">{t('customRoles.intro')}</p>
        </div>
        {canEdit && (
          <button type="button" className="v-btn v-btn-primary" onClick={() => setDraft(blank())}>
            <Icon name="plus" size={14} /> {t('customRoles.new')}
          </button>
        )}
      </div>
      {error && !draft && (
        <p role="alert" className="rounded-lg bg-red-500/[0.07] px-3 py-2.5 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {!roles ? (
        <div className="v-skeleton h-24 rounded-xl" />
      ) : roles.length === 0 ? (
        <p className="rounded-xl px-4 py-6 text-center text-sm text-muted ring-1 ring-inset ring-line">{canEdit ? t('customRoles.emptyEdit') : t('customRoles.empty')}</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {roles.map((r) => (
            <li key={r.id} className="rounded-xl p-4 ring-1 ring-inset ring-line" data-testid="custom-role">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink" dir="auto">
                    {r.name}
                  </p>
                  <p className="mt-0.5 text-xs text-faint">
                    {t('customRoles.basedOn', { role: t(`roles.${r.base}.name`) })} · {t('rolesView.people', { count: r.members, value: r.members })}
                  </p>
                  {r.description && (
                    <p className="mt-1 text-xs text-muted" dir="auto">
                      {r.description}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <>
                    <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => setDraft({ id: r.id, name: r.name, description: r.description ?? '', base: r.base, capabilities: r.capabilities })}>
                      {t('customRoles.edit')}
                    </button>
                    <button type="button" aria-label={t('customRoles.deleteNamed', { name: r.name })} className="v-hit text-muted hover:text-red-600" onClick={() => remove(r)}>
                      <Icon name="trash" size={13} />
                    </button>
                  </>
                )}
              </div>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {PERMISSION_AREAS.map((a) => {
                  const level = levelIn(r.capabilities, a.id);
                  return level ? (
                    <li key={a.id} className="v-badge">
                      {t(`customRoles.areas.${a.id}.name`)}: {t(`customRoles.levels.${level}`)}
                    </li>
                  ) : null;
                })}
                {r.capabilities.length === 0 && <li className="text-xs text-faint">{t('customRoles.ownWorkOnly')}</li>}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={!!draft}
        onClose={() => setDraft(null)}
        closeLabel={t('customRoles.close')}
        title={draft?.id ? t('customRoles.editTitle') : t('customRoles.newTitle')}
        subtitle={t('customRoles.sheetHint')}
      >
        {draft && (
          <form onSubmit={save} className="space-y-5">
            {error && (
              <p role="alert" className="rounded-lg bg-red-500/[0.07] px-3 py-2.5 text-xs text-red-700 dark:text-red-300">
                {error}
              </p>
            )}
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink">{t('customRoles.name')}</span>
              <input className="v-field w-full" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t('customRoles.namePlaceholder')} dir="auto" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink">{t('customRoles.description')}</span>
              <input className="v-field w-full" value={draft.description} maxLength={200} onChange={(e) => setDraft({ ...draft, description: e.target.value })} dir="auto" />
            </label>
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-ink">{t('customRoles.base')}</legend>
              <p className="mb-2 text-xs leading-relaxed text-muted">{t('customRoles.baseHint')}</p>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t('customRoles.base')}>
                {CUSTOM_ROLE_BASES.map((b) => (
                  <button
                    key={b}
                    type="button"
                    role="radio"
                    aria-checked={draft.base === b}
                    onClick={() => setDraft({ ...draft, base: b, ...(draft.id ? {} : { capabilities: roleCapabilities(b) }) })}
                    className={`rounded-lg px-3 py-2 text-sm ring-1 ring-inset ${draft.base === b ? 'bg-accent/10 font-medium text-accent ring-accent/40' : 'text-muted ring-line hover:bg-elevated'}`}
                  >
                    {t(`roles.${b}.name`)}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-ink">{t('customRoles.permissions')}</legend>
              <ul className="divide-y divide-line rounded-xl ring-1 ring-inset ring-line">
                {PERMISSION_AREAS.map((a) => {
                  const current = levelIn(draft.capabilities, a.id);
                  const options: (PermissionLevel | null)[] = [null, ...(a.levels as readonly PermissionLevel[])];
                  return (
                    <li key={a.id} className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-[140px] flex-1 text-sm font-medium text-ink">{t(`customRoles.areas.${a.id}.name`)}</span>
                        <div className="flex gap-1" role="radiogroup" aria-label={t(`customRoles.areas.${a.id}.name`)}>
                          {options.map((o) => (
                            <button
                              key={o ?? 'none'}
                              type="button"
                              role="radio"
                              aria-checked={current === o}
                              onClick={() => setLevel(a.id, o)}
                              className={`rounded-md px-2.5 py-1 text-xs ring-1 ring-inset ${current === o ? 'bg-accent text-white ring-accent' : 'text-muted ring-line hover:bg-elevated'}`}
                            >
                              {t(`customRoles.levels.${o ?? 'none'}`)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted">
                        {current ? t(`customRoles.areas.${a.id}.${current}`) : t('customRoles.noAccess')}
                      </p>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs leading-relaxed text-faint">{t('customRoles.never')}</p>
            </fieldset>
            <div className="flex gap-2">
              <button className="v-btn v-btn-primary disabled:opacity-50" disabled={busy || draft.name.trim().length < 2}>
                {t('customRoles.save')}
              </button>
              <button type="button" className="v-btn v-btn-ghost" onClick={() => setDraft(null)}>
                {t('customRoles.cancel')}
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </section>
  );
}
