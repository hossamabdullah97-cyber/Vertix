'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { MAX_ROWS, parseCsv, parseRows, templateCsv, type ParsedRow } from '@/lib/import-members';

interface Result {
  row: number;
  email: string;
  status: 'invited' | 'added' | 'member' | 'duplicate' | 'failed';
  card: 'created' | 'exists' | 'failed' | 'skipped';
  reason?: string;
  code?: 'plan-limit';
  emailSent?: boolean;
}

interface Usage {
  limits: { members: number | null; cards: number | null };
  usage: { members: number; cards: number };
}

type Step = { kind: 'pick' } | { kind: 'preview'; file: string; rows: ParsedRow[]; tooMany: boolean } | { kind: 'done'; results: Result[] };

async function readTable(file: File): Promise<unknown[][]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return parseCsv(await file.text());
  // Loaded only when someone imports a workbook.
  const { default: readXlsxFile } = await import('read-excel-file');
  return (await readXlsxFile(file)) as unknown[][];
}

/**
 * Brings a whole team in from Excel or CSV: pick the file, check the rows,
 * then everyone is invited at once, on their team, with a card each.
 */
export function ImportPeople({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const { t } = useTranslation('teams');
  const { locale } = useLocale();
  const lang = locale === 'ar' ? 'ar' : 'en';
  const fmt = (n: number) => formatNumber(n, locale);
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [createCards, setCreateCards] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [room, setRoom] = useState<{ members: number | null; cards: number | null } | null>(null);

  // How many more people and cards the plan allows, to warn before sending.
  useEffect(() => {
    if (!open) return;
    authFetch<Usage>('/billing/subscription')
      .then((u) =>
        setRoom({
          members: u.limits.members === null ? null : Math.max(0, u.limits.members - u.usage.members),
          cards: u.limits.cards === null ? null : Math.max(0, u.limits.cards - u.usage.cards),
        }),
      )
      .catch(() => setRoom(null));
  }, [open]);

  function close() {
    onClose();
    setTimeout(() => {
      setStep({ kind: 'pick' });
      setError(null);
    }, 250);
  }

  async function load(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setError(t('import.errors.type'));
      return;
    }
    try {
      const { rows, columns, tooMany } = parseRows(await readTable(file));
      if (columns.email === undefined) {
        setError(t('import.errors.noEmail'));
        return;
      }
      if (rows.length === 0) {
        setError(t('import.errors.empty'));
        return;
      }
      setStep({ kind: 'preview', file: file.name, rows, tooMany });
    } catch {
      setError(t('import.errors.read'));
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([templateCsv(lang)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = lang === 'ar' ? 'فريق-vertex.csv' : 'vertex-team.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function submit(rows: ParsedRow[]) {
    const ready = rows.filter((r) => !r.problem);
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch<{ results: Result[] }>('/orgs/members/import', {
        method: 'POST',
        body: JSON.stringify({
          createCards,
          lang,
          rows: ready.map((r) => ({
            email: r.email,
            role: r.role,
            ...(r.name ? { name: r.name } : {}),
            ...(r.title ? { title: r.title } : {}),
            ...(r.phone ? { phone: r.phone } : {}),
            ...(r.team ? { team: r.team } : {}),
          })),
        }),
      });
      setStep({ kind: 'done', results: res.results });
      onImported();
    } catch {
      setError(t('import.errors.send'));
    } finally {
      setBusy(false);
    }
  }

  const preview = step.kind === 'preview' ? step : null;
  const ready = preview ? preview.rows.filter((r) => !r.problem) : [];
  const skipped = preview ? preview.rows.length - ready.length : 0;

  const footer =
    step.kind === 'preview' ? (
      <div className="flex items-center gap-2">
        <button type="button" className="v-btn v-btn-ghost" disabled={busy} onClick={() => setStep({ kind: 'pick' })}>
          {t('import.back')}
        </button>
        <button type="button" className="v-btn v-btn-primary ms-auto" disabled={busy || ready.length === 0} onClick={() => submit(step.rows)}>
          {busy ? t('import.sending', { count: ready.length, value: fmt(ready.length) }) : t('import.send', { count: ready.length, value: fmt(ready.length) })}
        </button>
      </div>
    ) : step.kind === 'done' ? (
      <button type="button" className="v-btn v-btn-primary w-full" onClick={close}>
        {t('import.finish')}
      </button>
    ) : undefined;

  return (
    <Sheet open={open} onClose={close} closeLabel={t('actions.close')} title={t('import.title')} subtitle={t('import.subtitle')} footer={footer}>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-500/[0.07] px-3 py-2.5 text-[12.5px] leading-relaxed text-red-700 dark:text-red-300">
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
            <span className="text-[13.5px] font-medium text-ink">{t('import.pick')}</span>
            <span className="text-[12.5px] text-muted">{t('import.pickHint', { max: fmt(MAX_ROWS) })}</span>
          </button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              void load(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          <h3 className="mt-6 text-[13px] font-semibold text-ink">{t('import.columnsTitle')}</h3>
          <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-muted">
            <li>
              <span className="font-medium text-ink">{t('import.columns.email')}</span> · {t('import.required')}
            </li>
            <li>{t('import.columns.others')}</li>
            <li>{t('import.columns.role')}</li>
          </ul>
          <button type="button" onClick={downloadTemplate} className="v-hit mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline">
            <Icon name="download" size={14} />
            {t('import.template')}
          </button>
        </>
      )}

      {preview && (
        <>
          <p className="text-[13px] text-muted">
            <span className="font-medium text-ink">{preview.file}</span> · {t('import.ready', { count: ready.length, value: fmt(ready.length) })}
            {skipped > 0 && <span className="text-amber-700 dark:text-amber-400"> · {t('import.skipped', { count: skipped, value: fmt(skipped) })}</span>}
          </p>
          {preview.tooMany && <p className="mt-2 text-[12.5px] text-amber-700 dark:text-amber-400">{t('import.tooMany', { max: fmt(MAX_ROWS) })}</p>}
          {room && room.members !== null && ready.length > room.members && (
            <p className="mt-3 rounded-lg bg-amber-500/[0.08] px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-800 dark:text-amber-300">
              {room.members === 0 ? t('import.planFull') : t('import.planRoom', { count: room.members, value: fmt(room.members) })}{' '}
              <Link href="/billing" className="font-medium underline underline-offset-2">
                {t('import.upgrade')}
              </Link>
            </p>
          )}

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ring-inset ring-line">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--v-accent))]" checked={createCards} onChange={(e) => setCreateCards(e.target.checked)} />
            <span>
              <span className="block text-[13px] font-medium text-ink">{t('import.createCards')}</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">{t('import.createCardsHint')}</span>
            </span>
          </label>

          <ul className="-mx-5 mt-4 divide-y divide-line border-y border-line">
            {preview.rows.map((r) => (
              <li key={r.line} className={`flex items-start gap-3 px-5 py-2.5 ${r.problem ? 'bg-amber-500/[0.05]' : ''}`}>
                <span className="tabular mt-0.5 w-6 shrink-0 text-[11px] text-faint">{r.line}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{r.name || r.email || '—'}</span>
                  <span className="block truncate text-[12px] text-muted" dir="ltr" style={{ textAlign: 'start' }}>
                    {r.email || t('import.noEmail')}
                  </span>
                  {(r.title || r.team) && <span className="block truncate text-[12px] text-faint">{[r.title, r.team].filter(Boolean).join(' · ')}</span>}
                </span>
                {r.problem ? (
                  <span className="v-badge v-badge-warning shrink-0">{t(`import.problems.${r.problem}`)}</span>
                ) : (
                  <span className="v-badge v-badge-neutral shrink-0">{t(`roles.${r.role}.name`)}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {step.kind === 'done' && <Summary results={step.results} />}
    </Sheet>
  );
}

function Summary({ results }: { results: Result[] }) {
  const { t } = useTranslation('teams');
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);
  const joined = results.filter((r) => r.status === 'invited' || r.status === 'added').length;
  const already = results.filter((r) => r.status === 'member').length;
  const cards = results.filter((r) => r.card === 'created').length;
  const problems = results.filter((r) => r.status === 'failed' || r.status === 'duplicate' || r.card === 'failed' || r.emailSent === false);
  const nobody = joined === 0 && already === 0;
  const why = (r: Result) => (r.code === 'plan-limit' ? t('import.done.planLimit') : r.reason ?? '');
  const stats = [
    { label: t('import.done.invited'), value: joined },
    { label: t('import.done.cards'), value: cards },
    { label: t('import.done.already'), value: already },
  ];
  return (
    <>
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full ${nobody ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
          <Icon name={nobody ? 'alert' : 'check'} size={18} />
        </span>
        <p className="text-[14px] font-medium text-ink">{nobody ? t('import.done.nobody') : t('import.done.title')}</p>
      </div>
      <dl className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl ring-1 ring-inset ring-line">
        {stats.map((s, i) => (
          <div key={s.label} className={`px-3 py-3 ${i ? 'border-s border-line' : ''}`}>
            <dt className="text-[12px] text-muted">{s.label}</dt>
            <dd className="tabular mt-1 text-[20px] font-semibold text-ink">{fmt(s.value)}</dd>
          </div>
        ))}
      </dl>
      {!nobody && <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{t('import.done.next')}</p>}
      {problems.length > 0 && (
        <>
          <h3 className="mt-5 text-[13px] font-semibold text-ink">{t('import.done.problems', { count: problems.length, value: fmt(problems.length) })}</h3>
          <ul className="-mx-5 mt-2 divide-y divide-line border-y border-line">
            {problems.map((r) => (
              <li key={`${r.row}-${r.email}`} className="px-5 py-2.5">
                <span className="block truncate text-[13px] text-ink" dir="ltr" style={{ textAlign: 'start' }}>
                  {r.email}
                </span>
                <span className="block text-[12px] text-muted">
                  {r.status === 'duplicate'
                    ? t('import.problems.duplicate')
                    : r.status === 'failed'
                      ? t('import.done.notInvited', { reason: why(r) })
                      : r.card === 'failed'
                        ? t('import.done.noCard', { reason: why(r) })
                        : t('import.done.emailFailed')}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
