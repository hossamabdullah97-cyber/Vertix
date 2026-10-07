'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ErrorGroupView } from '@vertex/shared';
import { authFetch } from '@/lib/client';
import { formatDateTime, formatNumber, formatRelativeTime } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Notice, Pills } from './shared';

type Source = 'all' | 'BROWSER' | 'APP' | 'API';
type Status = 'open' | 'resolved';

/**
 * Errors people met: in their browser, or in the API on our side. Each bug is
 * one row, with how often it happened, to how many people, and when last.
 * Marking one fixed hides it until it happens again.
 */
export function Errors() {
  const { t } = useTranslation('admin');
  const { locale } = useLocale();
  const [source, setSource] = useState<Source>('all');
  const [status, setStatus] = useState<Status>('open');
  const [list, setList] = useState<ErrorGroupView[] | null>(null);
  const [open, setOpen] = useState<ErrorGroupView | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const q = new URLSearchParams({ status, ...(source === 'all' ? {} : { source }) });
    return authFetch<ErrorGroupView[]>(`/admin/errors?${q}`).then(setList);
  }, [source, status]);

  useEffect(() => {
    setList(null);
    load().catch((e) => {
      setList([]);
      setError((e as Error).message);
    });
  }, [load]);

  async function toggle(g: ErrorGroupView) {
    setBusy(g.id);
    setError('');
    try {
      await authFetch(`/admin/errors/${g.id}/${g.resolvedAt ? 'reopen' : 'resolve'}`, { method: 'POST' });
      setOpen(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const n = (v: number) => formatNumber(v, locale);

  return (
    <div className="max-w-[1180px]">
      <p className="mb-5 text-sm text-muted">{t('errors.intro')}</p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Pills
          label={t('errors.sourceLabel')}
          value={source}
          onChange={setSource}
          options={[
            { key: 'all', label: t('errors.source.all') },
            { key: 'BROWSER', label: t('errors.source.BROWSER') },
            { key: 'APP', label: t('errors.source.APP') },
            { key: 'API', label: t('errors.source.API') },
          ]}
        />
        <Pills
          label={t('errors.statusLabel')}
          value={status}
          onChange={setStatus}
          options={[
            { key: 'open', label: t('errors.status.open') },
            { key: 'resolved', label: t('errors.status.resolved') },
          ]}
        />
      </div>
      {error && (
        <Notice tone="danger" onDismiss={() => setError('')}>
          {error}
        </Notice>
      )}
      {!list ? (
        <div className="v-skeleton h-72 rounded-xl" />
      ) : list.length === 0 ? (
        <p className="rounded-xl py-14 text-center text-sm text-muted ring-1 ring-inset ring-line">{status === 'open' ? t('errors.emptyOpen') : t('errors.emptyResolved')}</p>
      ) : (
        <div className="v-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="v-table">
              <thead>
                <tr>
                  <th>{t('errors.cols.error')}</th>
                  <th>{t('errors.cols.where')}</th>
                  <th className="text-end">{t('errors.cols.count')}</th>
                  <th className="text-end">{t('errors.cols.people')}</th>
                  <th>{t('errors.cols.last')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((g) => (
                  <tr key={g.id} data-testid="error-row" className="cursor-pointer" onClick={() => setOpen(g)}>
                    <td className="max-w-[420px]">
                      <span className="flex items-center gap-2">
                        <span className={`v-badge shrink-0 ${g.source === 'API' ? 'v-badge-danger' : 'v-badge-warning'}`}>{t(`errors.source.${g.source}`)}</span>
                        <button type="button" className="min-w-0 truncate text-start font-medium text-ink hover:underline" onClick={() => setOpen(g)}>
                          <bdi>
                            {g.name}: {g.message}
                          </bdi>
                        </button>
                      </span>
                    </td>
                    <td className="max-w-[220px] truncate font-mono text-xs text-muted">
                      <bdi>{g.path ?? '—'}</bdi>
                    </td>
                    <td className="tabular text-end text-ink">{n(g.count)}</td>
                    <td className="tabular text-end text-muted">{n(g.users)}</td>
                    <td className="whitespace-nowrap text-muted">{formatRelativeTime(g.lastSeenAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        closeLabel={t('errors.close')}
        title={open ? <bdi>{open.name}</bdi> : ''}
        subtitle={open ? t(`errors.source.${open.source}`) : undefined}
        footer={
          open && (
            <button type="button" onClick={() => toggle(open)} disabled={busy === open.id} className={`v-btn w-full ${open.resolvedAt ? 'v-btn-ghost' : 'v-btn-primary'} disabled:opacity-50`}>
              <Icon name={open.resolvedAt ? 'undo' : 'check'} size={14} /> {open.resolvedAt ? t('errors.reopen') : t('errors.resolve')}
            </button>
          )
        }
      >
        {open && (
          <>
            <p className="text-sm font-medium leading-relaxed text-ink" dir="ltr" style={{ textAlign: 'start' }}>
              {open.message}
            </p>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">{t('errors.cols.count')}</dt>
              <dd className="tabular text-ink">{n(open.count)}</dd>
              <dt className="text-muted">{t('errors.cols.people')}</dt>
              <dd className="tabular text-ink">{n(open.users)}</dd>
              <dt className="text-muted">{t('errors.first')}</dt>
              <dd className="text-ink">{formatDateTime(open.firstSeenAt, locale)}</dd>
              <dt className="text-muted">{t('errors.cols.last')}</dt>
              <dd className="text-ink">{formatDateTime(open.lastSeenAt, locale)}</dd>
              {open.path && (
                <>
                  <dt className="text-muted">{t('errors.cols.where')}</dt>
                  <dd className="break-all font-mono text-xs text-ink">
                    <bdi>{open.path}</bdi>
                  </dd>
                </>
              )}
              {open.release && (
                <>
                  <dt className="text-muted">{t('errors.release')}</dt>
                  <dd className="font-mono text-xs text-ink">
                    <bdi>{open.release}</bdi>
                  </dd>
                </>
              )}
              {open.userAgent && (
                <>
                  <dt className="text-muted">{t('errors.browser')}</dt>
                  <dd className="break-all text-xs text-muted" dir="ltr" style={{ textAlign: 'start' }}>
                    {open.userAgent}
                  </dd>
                </>
              )}
            </dl>
            {open.stack && (
              <>
                <h3 className="mt-5 text-sm font-semibold text-ink">{t('errors.stack')}</h3>
                <pre className="mt-2 max-h-[360px] overflow-auto rounded-lg bg-elevated p-3 font-mono text-2xs leading-relaxed text-ink ring-1 ring-inset ring-line" dir="ltr">
                  {open.stack}
                </pre>
              </>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
