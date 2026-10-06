'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CustomFieldDef, CustomFieldValue } from '@vertex/shared';
import { coerceFieldValue } from '@vertex/shared';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { inputDir } from '@/lib/format';
import { Icon } from '@/components/Icon';

type Values = Record<string, CustomFieldValue>;

/**
 * The workspace's own fields on a lead, each edited in place: text, links and
 * numbers commit on leaving the field or Enter, the rest as they change. An
 * empty value clears it. Those who may manage fields get a way to.
 */
export function CustomFieldsPanel({
  fields,
  values,
  busy,
  onChange,
  onManage,
}: {
  fields: CustomFieldDef[];
  values: Values | null | undefined;
  busy: boolean;
  onChange: (id: string, value: CustomFieldValue | null) => void;
  onManage?: () => void;
}) {
  const { t } = useTranslation('crm');
  if (!fields.length) {
    return onManage ? (
      <div className="mt-6 rounded-lg border border-dashed border-line px-3 py-4 text-center">
        <p className="text-xs text-muted">{t('fields.emptyDrawer')}</p>
        <button type="button" onClick={onManage} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
          <Icon name="plus" size={12} /> {t('fields.add')}
        </button>
      </div>
    ) : null;
  }
  return (
    <section className="mt-6" aria-labelledby="lead-fields">
      <div className="mb-2 flex items-center justify-between">
        <h3 id="lead-fields" className="text-xs font-semibold uppercase tracking-wide text-faint rtl:normal-case rtl:tracking-normal">
          {t('fields.title')}
        </h3>
        {onManage && (
          <button type="button" onClick={onManage} className="text-xs font-medium text-accent hover:underline">
            {t('fields.manage')}
          </button>
        )}
      </div>
      <dl className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 text-sm">
        {fields.map((f) => (
          <FieldRow key={f.id} field={f} value={values?.[f.id]} busy={busy} onChange={(v) => onChange(f.id, v)} />
        ))}
      </dl>
    </section>
  );
}

function FieldRow({ field, value, busy, onChange }: { field: CustomFieldDef; value: CustomFieldValue | undefined; busy: boolean; onChange: (v: CustomFieldValue | null) => void }) {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  const shown = value === undefined || value === null ? '' : String(value);
  const [draft, setDraft] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setDraft(shown);
    setBad(false);
  }, [shown]);

  function commit() {
    if (draft === shown) return;
    const next = coerceFieldValue(field, draft);
    if (next === undefined) return setBad(true);
    setBad(false);
    onChange(next);
  }

  const id = `field-${field.id}`;
  const label = (
    <dt className="truncate text-faint">
      <label htmlFor={id}>{field.label}</label>
    </dt>
  );
  const textCls = `v-field !h-11 w-full !text-sm sm:!h-8 ${bad ? '!ring-red-500/60' : ''}`;

  if (field.type === 'CHECKBOX')
    return (
      <>
        {label}
        <dd>
          <input id={id} type="checkbox" disabled={busy} checked={value === true} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--v-accent))]" />
        </dd>
      </>
    );
  if (field.type === 'SELECT')
    return (
      <>
        {label}
        <dd>
          <select id={id} value={shown} disabled={busy} onChange={(e) => onChange(e.target.value || null)} className="v-field !h-11 !w-auto max-w-full !pe-8 !text-sm sm:!h-8">
            <option value="">{t('fields.none')}</option>
            {/* A value whose option was since taken away still shows. */}
            {shown && !field.options.includes(shown) && <option value={shown}>{shown}</option>}
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </dd>
      </>
    );
  if (field.type === 'DATE')
    return (
      <>
        {label}
        <dd>
          <input id={id} type="date" disabled={busy} value={shown} onChange={(e) => onChange(e.target.value || null)} className="v-field !h-11 !w-auto !text-sm sm:!h-8" />
        </dd>
      </>
    );
  return (
    <>
      {label}
      <dd className="flex items-center gap-1.5">
        <input
          id={id}
          type="text"
          inputMode={field.type === 'NUMBER' ? 'decimal' : field.type === 'URL' ? 'url' : undefined}
          dir={field.type === 'URL' || field.type === 'NUMBER' ? inputDir('url', locale) : 'auto'}
          disabled={busy}
          value={draft}
          placeholder={t(`fields.placeholders.${field.type}`)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setDraft(shown);
          }}
          aria-invalid={bad || undefined}
          className={textCls}
        />
        {field.type === 'URL' && shown && (
          <a href={shown} target="_blank" rel="noopener noreferrer" aria-label={t('fields.open')} className="v-hit shrink-0 text-muted hover:text-ink">
            <Icon name="link" size={14} />
          </a>
        )}
      </dd>
      {bad && <p className="col-span-2 -mt-2 text-xs text-red-600 dark:text-red-400">{t(`fields.invalid.${field.type}`)}</p>}
    </>
  );
}
