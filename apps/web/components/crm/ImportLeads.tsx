'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LEAD_IMPORT_BATCH, LEAD_IMPORT_MAX, type ImportLeadsResult, type ImportRowResult } from '@vertex/shared';
import { authFetch } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { parseCsv } from '@/lib/import-members';
import { identifies, leadsTemplateCsv, parseLeadRows, type ParsedLead } from '@/lib/import-leads';
import { downloadText } from '@/lib/export-leads';
import { useCustomFields } from '@/lib/custom-fields';
import type { Stage } from '@/lib/crm';
import enCrm from '@/locales/en/crm.json';
import arCrm from '@/locales/ar/crm.json';

type Duplicates = 'skip' | 'fill';
type Step =
  | { kind: 'pick' }
  | { kind: 'checking'; file: string }
  | { kind: 'preview'; file: string; leads: ParsedLead[]; results: Map<number, ImportRowResult>; tooMany: boolean }
  | { kind: 'importing'; done: number; total: number }
  | { kind: 'done'; created: number; filled: number; skipped: number };

/** Rows shown in the preview; the counts above it cover the whole file. */
const SHOWN = 300;

async function readTable(file: File): Promise<unknown[][]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return parseCsv(await file.text());
  // Loaded only when someone imports a workbook.
  const { default: readXlsxFile } = await import('read-excel-file');
  return (await readXlsxFile(file)) as unknown[][];
}

/** Sends rows in batches the API takes, adding the answers up. */
async function send(leads: ParsedLead[], duplicates: Duplicates, dryRun: boolean, onBatch?: (sent: number) => void): Promise<ImportLeadsResult> {
  const rows = leads.filter((l) => !l.problem).map((l) => l.row);
  const total: ImportLeadsResult = { created: 0, filled: 0, duplicates: 0, invalid: 0, rows: [] };
  for (let i = 0; i < rows.length; i += LEAD_IMPORT_BATCH) {
    const part = await authFetch<ImportLeadsResult>('/leads/import', { method: 'POST', body: JSON.stringify({ rows: rows.slice(i, i + LEAD_IMPORT_BATCH), duplicates, dryRun }) });
    total.created += part.created;
    total.filled += part.filled;
    total.duplicates += part.duplicates;
    total.invalid += part.invalid;
    total.rows.push(...part.rows);
    onBatch?.(Math.min(rows.length, i + LEAD_IMPORT_BATCH));
  }
  return total;
}

/**
 * Leads from Excel or CSV: pick the file, see what each row will become
 * (new, already here, or why not), then bring them in. Leads already here,
 * found by email or phone, are left alone or have their gaps filled.
 */
export function ImportLeads({ open, stages, onClose, onImported }: { open: boolean; stages: Stage[]; onClose: () => void; onImported: () => void }) {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  const lang = locale === 'ar' ? 'ar' : 'en';
  const fmt = (n: number) => formatNumber(n, locale);
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [duplicates, setDuplicates] = useState<Duplicates>('skip');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const customFields = useCustomFields();

  // Every name a stage may have in a file: as stored, and as shown in either language.
  const stageNames = useMemo(
    () =>
      stages.map((s) => {
        const key = s.name.trim().toLowerCase() as keyof typeof enCrm.stages;
        return { id: s.id, names: [s.name, enCrm.stages[key], arCrm.stages[key as keyof typeof arCrm.stages]].filter(Boolean) as string[] };
      }),
    [stages],
  );

  function close() {
    if (step.kind === 'importing') return;
    onClose();
    setTimeout(() => {
      setStep({ kind: 'pick' });
      setError(null);
      setDuplicates('skip');
    }, 250);
  }

  async function check(file: string, leads: ParsedLead[], tooMany: boolean, mode: Duplicates) {
    setError(null);
    setStep({ kind: 'checking', file });
    try {
      const res = await send(leads, mode, true);
      setStep({ kind: 'preview', file, leads, tooMany, results: new Map(res.rows.map((r) => [r.line, r])) });
    } catch (e) {
      setError((e as Error).message || t('import.errors.send'));
      setStep({ kind: 'pick' });
    }
  }

  async function load(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/\.(xlsx|csv)$/i.test(file.name)) return setError(t('import.errors.type'));
    let parsed;
    try {
      parsed = parseLeadRows(await readTable(file), stageNames, customFields ?? []);
    } catch {
      return setError(t('import.errors.read'));
    }
    if (!identifies(parsed.columns)) return setError(t('import.errors.noColumns'));
    if (!parsed.leads.length) return setError(t('import.errors.empty'));
    await check(file.name, parsed.leads, parsed.tooMany, duplicates);
  }

  async function changeDuplicates(mode: Duplicates) {
    setDuplicates(mode);
    if (step.kind === 'preview') await check(step.file, step.leads, step.tooMany, mode);
  }

  async function run() {
    if (step.kind !== 'preview') return;
    const { leads } = step;
    const total = leads.filter((l) => !l.problem).length;
    setError(null);
    setStep({ kind: 'importing', done: 0, total });
    try {
      const res = await send(leads, duplicates, false, (done) => setStep({ kind: 'importing', done, total }));
      setStep({ kind: 'done', created: res.created, filled: res.filled, skipped: res.duplicates + res.invalid + leads.filter((l) => l.problem).length });
      onImported();
    } catch (e) {
      // Batches already sent are in; checking again shows them as already here.
      setError(t('import.errors.partway', { reason: (e as Error).message }));
      onImported();
      await check(step.file, leads, step.tooMany, duplicates);
    }
  }

  const preview = step.kind === 'preview' ? step : null;
  const counts = useMemo(() => {
    if (!preview) return null;
    const c = { create: 0, fill: 0, duplicate: 0, problem: 0 };
    for (const l of preview.leads) {
      const r = preview.results.get(l.row.line);
      if (l.problem || !r || r.outcome === 'invalid') c.problem++;
      else c[r.outcome]++;
    }
    return c;
  }, [preview]);

  // Problems first, then what will change, so the rows to look at are on top.
  const ordered = useMemo(() => {
    if (!preview) return [];
    const rank = (l: ParsedLead) => {
      const r = preview.results.get(l.row.line);
      return l.problem || r?.outcome === 'invalid' ? 0 : r?.notices?.length ? 1 : r?.outcome === 'duplicate' ? 3 : 2;
    };
    return [...preview.leads].sort((a, b) => rank(a) - rank(b) || a.row.line - b.row.line);
  }, [preview]);

  const toImport = counts ? counts.create + counts.fill : 0;

  const footer =
    step.kind === 'preview' ? (
      <div className="flex items-center gap-2">
        <button type="button" className="v-btn v-btn-ghost" onClick={() => setStep({ kind: 'pick' })}>
          {t('import.back')}
        </button>
        <button type="button" className="v-btn v-btn-primary ms-auto" disabled={toImport === 0} onClick={run}>
          {t('import.go', { count: toImport, value: fmt(toImport) })}
        </button>
      </div>
    ) : step.kind === 'done' ? (
      <button type="button" className="v-btn v-btn-primary w-full" onClick={close}>
        {t('import.finish')}
      </button>
    ) : undefined;

  const badge = (l: ParsedLead) => {
    const r = preview?.results.get(l.row.line);
    if (l.problem) return <span className="v-badge v-badge-warning shrink-0">{t(`import.problems.${l.problem}`)}</span>;
    if (!r) return null;
    if (r.outcome === 'invalid') return <span className="v-badge v-badge-warning shrink-0">{t(`import.problems.${r.problem ?? 'empty'}`)}</span>;
    if (r.outcome === 'duplicate') return <span className="v-badge v-badge-neutral shrink-0">{t('import.outcome.duplicate')}</span>;
    if (r.outcome === 'fill') return <span className="v-badge v-badge-accent shrink-0">{t('import.outcome.fill')}</span>;
    return <span className="v-badge v-badge-success shrink-0">{t('import.outcome.create')}</span>;
  };

  return (
    <Sheet open={open} onClose={close} closeLabel={t('import.close')} title={t('import.title')} subtitle={t('import.subtitle')} footer={footer}>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-500/[0.07] px-3 py-2.5 text-xs leading-relaxed text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {step.kind === 'pick' && (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void load(e.dataTransfer.files[0]);
            }}
            className={`flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-9 text-center transition-colors ${dragging ? 'border-accent bg-accent/5' : 'border-line hover:bg-elevated'}`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-elevated text-ink ring-1 ring-inset ring-line">
              <Icon name="upload" size={18} />
            </span>
            <span className="text-sm font-medium text-ink">{t('import.pick')}</span>
            <span className="text-xs text-muted">{t('import.pickHint', { max: fmt(LEAD_IMPORT_MAX) })}</span>
          </button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            data-testid="import-file"
            onChange={(e) => {
              void load(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          <h3 className="mt-6 text-sm font-semibold text-ink">{t('import.columnsTitle')}</h3>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
            <li>{t('import.columns.who')}</li>
            <li>{t('import.columns.others')}</li>
            <li>{t('import.columns.export')}</li>
          </ul>
          <button
            type="button"
            onClick={() => downloadText(leadsTemplateCsv(lang), lang === 'ar' ? 'عملاء-vertex.csv' : 'vertex-leads.csv')}
            className="v-hit mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
          >
            <Icon name="download" size={14} />
            {t('import.template')}
          </button>
        </>
      )}

      {step.kind === 'checking' && (
        <p className="flex items-center gap-2 text-sm text-muted" role="status">
          <Icon name="loader" size={15} className="animate-spin" /> {t('import.checking', { file: step.file })}
        </p>
      )}

      {preview && counts && (
        <>
          <p className="truncate text-sm font-medium text-ink">{preview.file}</p>
          <dl className="mt-3 grid grid-cols-3 overflow-hidden rounded-xl ring-1 ring-inset ring-line">
            {[
              { label: t('import.counts.new'), value: counts.create + counts.fill },
              { label: t('import.counts.duplicates'), value: counts.duplicate + counts.fill },
              { label: t('import.counts.problems'), value: counts.problem },
            ].map((s, i) => (
              <div key={s.label} className={`px-3 py-3 ${i ? 'border-s border-line' : ''}`}>
                <dt className="text-xs text-muted">{s.label}</dt>
                <dd className="tabular mt-1 text-xl font-semibold text-ink">{fmt(s.value)}</dd>
              </div>
            ))}
          </dl>
          {preview.tooMany && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t('import.tooMany', { max: fmt(LEAD_IMPORT_MAX) })}</p>}

          {counts.duplicate + counts.fill > 0 && (
            <fieldset className="mt-4 rounded-xl p-3 ring-1 ring-inset ring-line">
              <legend className="px-1 text-xs font-medium text-muted">{t('import.duplicates.title')}</legend>
              {(['skip', 'fill'] as const).map((mode) => (
                <label key={mode} className="flex cursor-pointer items-start gap-3 py-1.5">
                  <input type="radio" name="duplicates" className="mt-0.5 h-4 w-4 accent-[hsl(var(--v-accent))]" checked={duplicates === mode} onChange={() => void changeDuplicates(mode)} />
                  <span>
                    <span className="block text-sm text-ink">{t(`import.duplicates.${mode}`)}</span>
                    <span className="block text-xs leading-relaxed text-muted">{t(`import.duplicates.${mode}Hint`)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <ul className="-mx-5 mt-4 divide-y divide-line border-y border-line" aria-label={t('import.rows')}>
            {ordered.slice(0, SHOWN).map((l) => {
              const r = preview.results.get(l.row.line);
              const who = l.row.name || l.row.email || l.row.phone || l.row.company || '—';
              const sub = [l.row.name ? l.row.email || l.row.phone : null, l.row.company].filter(Boolean).join(' · ');
              return (
                <li key={l.row.line} className="flex items-start gap-3 px-5 py-2.5" data-testid="import-row">
                  <span className="tabular mt-0.5 w-8 shrink-0 text-2xs text-faint">{fmt(l.row.line)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{who}</span>
                    {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
                    {r?.notices?.map((n) => (
                      <span key={n} className="block text-xs text-amber-700 dark:text-amber-400">
                        {t(`import.notices.${n}`)}
                      </span>
                    ))}
                  </span>
                  {badge(l)}
                </li>
              );
            })}
          </ul>
          {ordered.length > SHOWN && <p className="mt-2 text-xs text-faint">{t('import.more', { count: ordered.length - SHOWN, value: fmt(ordered.length - SHOWN) })}</p>}
        </>
      )}

      {step.kind === 'importing' && (
        <div role="status">
          <p className="flex items-center gap-2 text-sm text-ink">
            <Icon name="loader" size={15} className="animate-spin" /> {t('import.importing', { done: fmt(step.done), total: fmt(step.total) })}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${step.total ? (step.done / step.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {step.kind === 'done' && (
        <>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Icon name="check" size={18} />
            </span>
            <p className="text-base font-medium text-ink">{t('import.done.title')}</p>
          </div>
          <dl className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl ring-1 ring-inset ring-line">
            {[
              { label: t('import.done.created'), value: step.created },
              { label: t('import.done.filled'), value: step.filled },
              { label: t('import.done.skipped'), value: step.skipped },
            ].map((s, i) => (
              <div key={s.label} className={`px-3 py-3 ${i ? 'border-s border-line' : ''}`}>
                <dt className="text-xs text-muted">{s.label}</dt>
                <dd className="tabular mt-1 text-2xl font-semibold text-ink">{fmt(s.value)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">{t('import.done.next')}</p>
        </>
      )}
    </Sheet>
  );
}
