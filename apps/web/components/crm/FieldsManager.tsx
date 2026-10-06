'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_FIELD_TYPES, MAX_CUSTOM_FIELDS, type CustomFieldDef, type CustomFieldType } from '@vertex/shared';
import { authFetch } from '@/lib/client';
import { fieldsChanged, useCustomFields } from '@/lib/custom-fields';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';

const TYPE_ICON: Record<CustomFieldType, string> = { TEXT: 'quote', NUMBER: 'gauge', DATE: 'calendar', SELECT: 'list', CHECKBOX: 'check', URL: 'link' };

/** "Retail, Real estate\nBanking" → one option per comma or line, each once. */
export function parseOptions(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[\n,،]/)
    .map((o) => o.trim())
    .filter((o) => o && !seen.has(o.toLowerCase()) && seen.add(o.toLowerCase()));
}

/**
 * The workspace's own lead fields: add one (a name and a kind, and the
 * choices for a choice field), rename it, change its choices, move it up or
 * down, or delete it with its values. For owners and admins.
 */
export function FieldsManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('crm');
  const fields = useCustomFields();
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomFieldType>('TEXT');
  const [options, setOptions] = useState('');
  const [editing, setEditing] = useState<{ id: string; label: string; options: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setEditing(null);
      setError('');
    }
  }, [open]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError('');
    try {
      await fn();
      fieldsChanged();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy('');
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    const ok = await run('add', () =>
      authFetch('/leads/fields', { method: 'POST', body: JSON.stringify({ label: label.trim(), type, options: type === 'SELECT' ? parseOptions(options) : [] }) }),
    );
    if (ok) {
      setLabel('');
      setOptions('');
      setType('TEXT');
    }
  }

  const save = (f: CustomFieldDef) =>
    editing &&
    run(f.id, () =>
      authFetch(`/leads/fields/${f.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ label: editing.label.trim(), ...(f.type === 'SELECT' ? { options: parseOptions(editing.options) } : {}) }),
      }),
    ).then((ok) => ok && setEditing(null));

  const remove = (f: CustomFieldDef) => {
    if (!window.confirm(t('fields.confirmDelete', { label: f.label }))) return;
    void run(f.id, () => authFetch(`/leads/fields/${f.id}`, { method: 'DELETE' }));
  };

  const move = (i: number, by: -1 | 1) => {
    if (!fields) return;
    const ids = fields.map((f) => f.id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void run('order', () => authFetch('/leads/fields/order', { method: 'PUT', body: JSON.stringify({ ids }) }));
  };

  const full = (fields?.length ?? 0) >= MAX_CUSTOM_FIELDS;

  return (
    <Sheet open={open} onClose={onClose} closeLabel={t('fields.close')} title={t('fields.manageTitle')} subtitle={t('fields.manageSubtitle')}>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-500/[0.07] px-3 py-2.5 text-xs leading-relaxed text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {!fields ? (
        <div className="v-skeleton h-32 rounded-xl" />
      ) : fields.length === 0 ? (
        <p className="rounded-xl px-4 py-6 text-center text-sm text-muted ring-1 ring-inset ring-line">{t('fields.emptyManager')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl ring-1 ring-inset ring-line" aria-label={t('fields.title')}>
          {fields.map((f, i) => (
            <li key={f.id} className="px-3 py-2.5" data-testid="field-row">
              {editing?.id === f.id ? (
                <div className="space-y-2">
                  <input className="v-field w-full" value={editing.label} maxLength={60} onChange={(e) => setEditing({ ...editing, label: e.target.value })} aria-label={t('fields.label')} dir="auto" autoFocus />
                  {f.type === 'SELECT' && (
                    <textarea
                      className="v-field min-h-[72px] w-full"
                      value={editing.options}
                      onChange={(e) => setEditing({ ...editing, options: e.target.value })}
                      aria-label={t('fields.options')}
                      dir="auto"
                    />
                  )}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditing(null)} className="v-btn v-btn-ghost !h-8 !text-xs">
                      {t('fields.cancel')}
                    </button>
                    <button type="button" onClick={() => save(f)} disabled={busy === f.id || !editing.label.trim()} className="v-btn !h-8 !text-xs disabled:opacity-50">
                      {t('fields.save')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-elevated text-muted ring-1 ring-inset ring-line">
                    <Icon name={TYPE_ICON[f.type]} size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{f.label}</span>
                    <span className="block truncate text-xs text-faint">
                      {t(`fields.types.${f.type}`)}
                      {f.type === 'SELECT' && ` · ${f.options.join('، ')}`}
                    </span>
                  </span>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || !!busy} aria-label={t('fields.up', { label: f.label })} className="v-hit text-muted hover:text-ink disabled:opacity-30">
                    <Icon name="arrow" size={13} className="-rotate-90" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === fields.length - 1 || !!busy} aria-label={t('fields.down', { label: f.label })} className="v-hit text-muted hover:text-ink disabled:opacity-30">
                    <Icon name="arrow" size={13} className="rotate-90" />
                  </button>
                  <button type="button" onClick={() => setEditing({ id: f.id, label: f.label, options: f.options.join('\n') })} className="text-xs font-medium text-accent hover:underline">
                    {t('fields.edit')}
                  </button>
                  <button type="button" onClick={() => remove(f)} disabled={busy === f.id} aria-label={t('fields.deleteNamed', { label: f.label })} className="v-hit text-muted hover:text-red-600">
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-6 rounded-xl p-4 ring-1 ring-inset ring-line">
        <h3 className="text-sm font-semibold text-ink">{t('fields.newTitle')}</h3>
        {full ? (
          <p className="mt-2 text-xs text-muted">{t('fields.full', { max: MAX_CUSTOM_FIELDS })}</p>
        ) : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label>
                <span className="mb-1.5 block text-xs font-medium text-ink">{t('fields.label')}</span>
                <input className="v-field w-full" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder={t('fields.labelPlaceholder')} dir="auto" />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-medium text-ink">{t('fields.type')}</span>
                <select className="v-field w-full" value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>
                  {CUSTOM_FIELD_TYPES.map((ty) => (
                    <option key={ty} value={ty}>
                      {t(`fields.types.${ty}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {type === 'SELECT' && (
              <label className="mt-3 block">
                <span className="mb-1.5 block text-xs font-medium text-ink">{t('fields.options')}</span>
                <textarea className="v-field min-h-[72px] w-full" value={options} onChange={(e) => setOptions(e.target.value)} placeholder={t('fields.optionsPlaceholder')} dir="auto" />
                <span className="mt-1 block text-xs text-faint">{t('fields.optionsHint')}</span>
              </label>
            )}
            <button className="v-btn v-btn-primary mt-4 disabled:opacity-50" disabled={busy === 'add' || !label.trim() || (type === 'SELECT' && !parseOptions(options).length)}>
              <Icon name="plus" size={14} /> {t('fields.add')}
            </button>
          </>
        )}
      </form>
    </Sheet>
  );
}
