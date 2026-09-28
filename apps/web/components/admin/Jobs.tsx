'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { formatRelativeTime } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { Notice } from './shared';

interface Job {
  id: string;
  name: string;
  status: 'QUEUED' | 'COMPLETED' | 'FAILED' | 'RUNNING';
  attempts: string;
  worker: string;
  startedAt: string;
  error?: string;
  retryable: boolean;
}

const BADGE: Record<string, string> = { QUEUED: 'v-badge-neutral', RUNNING: 'v-badge-accent', COMPLETED: 'v-badge-success', FAILED: 'v-badge-danger' };

/**
 * The platform's real background work: webhook deliveries (retried by the
 * dispatcher) and automation runs. A failed delivery can be sent again.
 */
export function Jobs() {
  const { t } = useTranslation('admin');
  const { locale } = useLocale();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => authFetch<Job[]>('/admin/queue-jobs').then(setJobs), []);
  useEffect(() => {
    load().catch((e) => {
      setJobs([]);
      setError((e as Error).message);
    });
  }, [load]);

  /** "Webhook · lead.created" is how the API names a job; say it in words. */
  const name = (j: Job) => {
    const [kind, rest = ''] = j.name.split(' · ');
    if (j.id.startsWith('webhook:')) return t('jobs.webhook', { event: t(`integrations:events.${rest}`, { defaultValue: rest }) });
    if (j.id.startsWith('automation:')) return t('jobs.automation', { name: rest });
    return kind;
  };

  async function retry(j: Job) {
    setBusy(j.id);
    setError('');
    try {
      await authFetch(`/admin/queue-jobs/${encodeURIComponent(j.id)}/action`, { method: 'POST', body: JSON.stringify({ action: 'RETRY' }) });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="max-w-[1180px]">
      <p className="mb-5 text-[13.5px] text-muted">{t('jobs.intro')}</p>
      {error && (
        <Notice tone="danger" onDismiss={() => setError('')}>
          {error}
        </Notice>
      )}
      {!jobs ? (
        <div className="v-skeleton h-72 rounded-xl" />
      ) : jobs.length === 0 ? (
        <p className="rounded-xl py-14 text-center text-[13.5px] text-muted ring-1 ring-inset ring-line">{t('jobs.empty')}</p>
      ) : (
        <div className="v-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="v-table">
              <thead>
                <tr>
                  <th>{t('jobs.cols.job')}</th>
                  <th>{t('jobs.cols.status')}</th>
                  <th className="hidden md:table-cell">{t('jobs.cols.target')}</th>
                  <th className="hidden !text-end sm:table-cell">{t('jobs.cols.attempts')}</th>
                  <th className="hidden !text-end md:table-cell">{t('jobs.cols.when')}</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="w-full max-w-0">
                      <span className="block truncate text-ink">{name(j)}</span>
                      {j.error && (
                        <span dir="auto" className="block truncate text-[12px] text-red-600 dark:text-red-400" title={j.error}>
                          {j.error}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className={`v-badge ${BADGE[j.status] ?? 'v-badge-neutral'}`}>{t(`jobs.status.${j.status}`, { defaultValue: j.status })}</span>
                    </td>
                    <td className="hidden max-w-[220px] md:table-cell">
                      <span dir="ltr" className="block truncate font-mono text-[12.5px] text-muted rtl:text-right">
                        {j.worker}
                      </span>
                    </td>
                    <td className="tabular hidden !text-end sm:table-cell" dir="ltr">
                      {j.attempts}
                    </td>
                    <td className="hidden whitespace-nowrap !text-end text-[13px] text-muted md:table-cell">{formatRelativeTime(j.startedAt, locale)}</td>
                    <td className="!text-end">
                      {j.retryable && (
                        <button onClick={() => retry(j)} disabled={!!busy} className="flex h-8 items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium text-accent hover:underline disabled:opacity-60">
                          <Icon name="refresh" size={13} />
                          {busy === j.id ? t('jobs.retrying') : t('jobs.retry')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
