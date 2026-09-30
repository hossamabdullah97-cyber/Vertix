'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { authFetch } from '@/lib/client';
import { formatDate, formatTime } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Notice, SearchField } from './shared';

interface Entry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
  actor: { name: string | null; email: string } | null;
  orgId?: string;
  orgName: string;
  metadata: Record<string, unknown> | null;
}

/**
 * An action in words. Platform actions have their own phrasing here; a
 * workspace's own actions reuse the Team page's; anything newer falls back to
 * its own words.
 */
export function describeAction(action: string, t: TFunction): string {
  const plan = action.match(/^UPGRADE_ORG_PLAN_(\w+)$/);
  if (plan) return t('admin:log.actions.UPGRADE_ORG_PLAN', { plan: t(`admin:plans.${plan[1]}`, { defaultValue: plan[1] }) });
  const own = t(`admin:log.actions.${action}`, { defaultValue: '' });
  if (own) return own;
  return t(`teams:activity.actions.${action.replace('.', '_')}`, { defaultValue: action.toLowerCase().replace(/[._]/g, ' ') });
}

/** The thing acted on, when the entry names it. */
function targetOf(e: Entry): string {
  const m = e.metadata ?? {};
  const pick = (k: string) => (typeof m[k] === 'string' && (m[k] as string).trim() ? (m[k] as string) : '');
  return pick('email') || pick('ownerEmail') || pick('name') || pick('uid') || '';
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function AuditLog() {
  const { t } = useTranslation('admin');
  const { locale } = useLocale();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Entry | null>(null);

  // The search runs on the server, over the whole log.
  useEffect(() => {
    const id = setTimeout(() => {
      authFetch<Entry[]>(`/admin/audit-logs${q.trim() ? `?search=${encodeURIComponent(q.trim())}` : ''}`)
        .then(setRows)
        .catch((e) => {
          setRows([]);
          setError((e as Error).message);
        });
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  function exportCsv() {
    if (!rows?.length) return;
    const head = ['time', 'actor', 'action', 'workspace', 'target_type', 'target_id', 'details'];
    const lines = rows.map((r) => [r.createdAt, r.actor?.email ?? '', r.action, r.orgName, r.targetType, r.targetId, r.metadata].map(csvCell).join(','));
    // The BOM makes Excel read Arabic names correctly.
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vertex-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const who = (e: Entry) => (e.actor ? e.actor.name || e.actor.email : t('log.system'));

  return (
    <div className="max-w-[1180px]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchField value={q} onChange={setQ} placeholder={t('log.searchPlaceholder')} className="sm:w-96" />
        <button onClick={exportCsv} disabled={!rows?.length} className="v-btn v-btn-ghost shrink-0 disabled:opacity-50 sm:ms-auto">
          <Icon name="download" size={14} /> {t('log.export')}
        </button>
      </div>
      {error && (
        <Notice tone="danger" onDismiss={() => setError('')}>
          {error}
        </Notice>
      )}

      {!rows ? (
        <div className="v-skeleton h-72 rounded-xl" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl py-14 text-center text-sm text-muted ring-1 ring-inset ring-line">{t('log.empty')}</p>
      ) : (
        <div className="v-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="v-table">
              <thead>
                <tr>
                  <th>{t('log.cols.what')}</th>
                  <th className="hidden md:table-cell">{t('log.cols.workspace')}</th>
                  <th className="!text-end">{t('log.cols.when')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const target = targetOf(e);
                  return (
                    <tr key={e.id} tabIndex={0} onClick={() => setOpen(e)} onKeyDown={(k) => k.key === 'Enter' && setOpen(e)} className="cursor-pointer outline-none focus-visible:[&>td]:bg-elevated">
                      <td className="w-full max-w-0">
                        <span className="block truncate text-sm text-ink">
                          <span className="font-medium">{who(e)}</span> <span className="text-muted">{describeAction(e.action, t)}</span>
                          {target && (
                            <>
                              {' '}
                              <bdi className="text-ink">{target}</bdi>
                            </>
                          )}
                        </span>
                        <span dir="ltr" className="block truncate font-mono text-2xs text-faint rtl:text-right">
                          {e.action}
                        </span>
                      </td>
                      <td className="hidden max-w-[220px] md:table-cell">
                        <span className="block truncate text-sm text-muted">{e.orgName}</span>
                      </td>
                      <td className="whitespace-nowrap !text-end text-sm text-muted">
                        {formatDate(e.createdAt, locale, { month: 'short', day: 'numeric' })} · {formatTime(e.createdAt, locale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} closeLabel={t('close')} title={open ? describeAction(open.action, t) : ''} subtitle={open ? `${formatDate(open.createdAt, locale)} · ${formatTime(open.createdAt, locale)}` : undefined}>
        {open && (
          <dl className="space-y-4 text-sm">
            {[
              [t('log.cols.who'), open.actor ? `${open.actor.name ? `${open.actor.name} · ` : ''}${open.actor.email}` : t('log.system')],
              [t('log.cols.workspace'), open.orgName],
              [t('log.target'), [open.targetType, open.targetId].filter(Boolean).join(' · ') || '—'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-0.5 break-words text-ink">
                  <bdi>{value}</bdi>
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-xs text-muted">{t('log.details')}</dt>
              <dd className="mt-1.5">
                <pre dir="ltr" className="overflow-x-auto rounded-lg bg-elevated px-3.5 py-3 text-start font-mono text-xs leading-relaxed text-ink ring-1 ring-inset ring-line">
                  {JSON.stringify({ action: open.action, ...(open.metadata ?? {}) }, null, 2)}
                </pre>
              </dd>
            </div>
          </dl>
        )}
      </Sheet>
    </div>
  );
}
