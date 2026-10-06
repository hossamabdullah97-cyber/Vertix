'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportRequestView } from '@vertex/shared';
import { authFetch } from '@/lib/client';
import { formatDateTime, formatNumber, formatRelativeTime } from '@/lib/format';
import { HELP, article, helpLocale } from '@/lib/help';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Notice, Pills } from './shared';

type Request = SupportRequestView & { email: string; name: string | null; orgName: string | null; page: string | null; userAgent: string | null };
type View = 'OPEN' | 'CLOSED' | 'articles' | 'emails';
type EmailStats = { sent: Record<string, number>; optedOut: number };
const EMAIL_KINDS = ['verifyEmail', 'finishCard', 'shareCard', 'inviteTeam', 'leadsWaiting'] as const;

/**
 * What people wrote from the help page, newest first: answer by email (the
 * reply goes to them), then mark it answered. And which help articles people
 * say didn't help, so they can be written better.
 */
export function Support() {
  const { t } = useTranslation('admin');
  const { locale } = useLocale();
  const help = HELP[helpLocale(locale)];
  const [view, setView] = useState<View>('OPEN');
  const [list, setList] = useState<Request[] | null>(null);
  const [feedback, setFeedback] = useState<{ article: string; helpful: number; notHelpful: number }[] | null>(null);
  const [emails, setEmails] = useState<EmailStats | null>(null);
  const [previewed, setPreviewed] = useState('');
  const [open, setOpen] = useState<Request | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (view === 'emails') return authFetch<EmailStats>('/admin/engagement').then(setEmails);
    if (view === 'articles') return authFetch<typeof feedback>('/admin/support/feedback').then(setFeedback);
    return authFetch<Request[]>(`/admin/support?status=${view}`).then(setList);
  }, [view]);

  useEffect(() => {
    setList(null);
    setFeedback(null);
    load().catch((e) => {
      setList([]);
      setFeedback([]);
      setError((e as Error).message);
    });
  }, [load]);

  async function toggle(r: Request) {
    setBusy(r.id);
    setError('');
    try {
      await authFetch(`/admin/support/${r.id}/${r.status === 'OPEN' ? 'close' : 'reopen'}`, { method: 'POST' });
      setOpen(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const n = (v: number) => formatNumber(v, locale);
  const replyHref = (r: Request) => `mailto:${r.email}?subject=${encodeURIComponent(`Re: [${r.ref}] ${r.subject}`)}`;

  return (
    <div className="max-w-[1180px]">
      <p className="mb-5 text-sm text-muted">{t('support.intro')}</p>
      <div className="mb-4">
        <Pills
          label={t('support.viewLabel')}
          value={view}
          onChange={setView}
          options={[
            { key: 'OPEN', label: t('support.views.OPEN') },
            { key: 'CLOSED', label: t('support.views.CLOSED') },
            { key: 'articles', label: t('support.views.articles') },
            { key: 'emails', label: t('support.views.emails') },
          ]}
        />
      </div>
      {error && (
        <Notice tone="danger" onDismiss={() => setError('')}>
          {error}
        </Notice>
      )}

      {view === 'emails' ? (
        !emails ? (
          <div className="v-skeleton h-72 rounded-xl" />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">{t('support.emails.intro')}</p>
            <ul className="divide-y divide-line rounded-xl ring-1 ring-inset ring-line" data-testid="engagement-stats">
              {EMAIL_KINDS.map((k) => (
                <li key={k} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="min-w-[200px] flex-1">
                    <span className="block font-medium text-ink">{t(`support.emails.kinds.${k}.name`)}</span>
                    <span className="block text-xs text-muted">{t(`support.emails.kinds.${k}.when`)}</span>
                  </span>
                  <span className="tabular text-xs text-muted">{t('support.emails.sent', { count: emails.sent[k] ?? 0 })}</span>
                  {k !== 'verifyEmail' &&
                    (['en', 'ar'] as const).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        disabled={!!busy}
                        onClick={() =>
                          void (async () => {
                            setBusy(`${k}-${lang}`);
                            setError('');
                            try {
                              await authFetch('/admin/engagement/preview', { method: 'POST', body: JSON.stringify({ kind: k, lang }) });
                              setPreviewed(`${k}-${lang}`);
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy('');
                            }
                          })()
                        }
                        className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                      >
                        {previewed === `${k}-${lang}` ? t('support.emails.previewSent') : t(`support.emails.preview_${lang}`)}
                      </button>
                    ))}
                </li>
              ))}
            </ul>
            <p className="text-xs text-faint">{t('support.emails.optedOut', { count: emails.optedOut })}</p>
          </div>
        )
      ) : view === 'articles' ? (
        !feedback ? (
          <div className="v-skeleton h-72 rounded-xl" />
        ) : feedback.length === 0 ? (
          <p className="rounded-xl py-14 text-center text-sm text-muted ring-1 ring-inset ring-line">{t('support.emptyArticles')}</p>
        ) : (
          <div className="v-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="v-table">
                <thead>
                  <tr>
                    <th>{t('support.cols.article')}</th>
                    <th className="text-end">{t('support.cols.helpful')}</th>
                    <th className="text-end">{t('support.cols.notHelpful')}</th>
                  </tr>
                </thead>
                <tbody>
                  {feedback.map((f) => (
                    <tr key={f.article} data-testid="feedback-row">
                      <td>
                        <a href={`/help/${f.article}`} target="_blank" rel="noreferrer" className="font-medium text-ink hover:underline">
                          {article(helpLocale(locale), f.article)?.title ?? f.article}
                        </a>
                      </td>
                      <td className="tabular text-end text-ink">{n(f.helpful)}</td>
                      <td className={`tabular text-end ${f.notHelpful ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted'}`}>{n(f.notHelpful)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : !list ? (
        <div className="v-skeleton h-72 rounded-xl" />
      ) : list.length === 0 ? (
        <p className="rounded-xl py-14 text-center text-sm text-muted ring-1 ring-inset ring-line">{view === 'OPEN' ? t('support.emptyOpen') : t('support.emptyClosed')}</p>
      ) : (
        <div className="v-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="v-table">
              <thead>
                <tr>
                  <th>{t('support.cols.subject')}</th>
                  <th>{t('support.cols.from')}</th>
                  <th>{t('support.cols.topic')}</th>
                  <th>{t('support.cols.received')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} data-testid="support-row" className="cursor-pointer" onClick={() => setOpen(r)}>
                    <td className="max-w-[420px]">
                      <button type="button" className="block max-w-full truncate text-start font-medium text-ink hover:underline" onClick={() => setOpen(r)}>
                        <bdi>{r.subject}</bdi>
                      </button>
                      <span className="tabular text-xs text-faint">
                        <bdi>{r.ref}</bdi>
                      </span>
                    </td>
                    <td className="max-w-[260px]">
                      <span className="block truncate text-ink">
                        <bdi>{r.name || r.email}</bdi>
                      </span>
                      <span className="block truncate text-xs text-faint">
                        <bdi>{r.orgName ?? r.email}</bdi>
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-muted">{help.ui.topics[r.topic]}</td>
                    <td className="whitespace-nowrap text-muted">{formatRelativeTime(r.createdAt, locale)}</td>
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
        closeLabel={t('support.close')}
        title={open ? <bdi>{open.subject}</bdi> : ''}
        subtitle={open ? `${open.ref} · ${help.ui.topics[open.topic]}` : undefined}
        footer={
          open && (
            <div className="flex gap-2">
              <a href={replyHref(open)} className="v-btn v-btn-primary flex-1">
                <Icon name="mail" size={14} /> {t('support.reply')}
              </a>
              <button type="button" onClick={() => toggle(open)} disabled={busy === open.id} className="v-btn flex-1 disabled:opacity-50">
                <Icon name={open.status === 'OPEN' ? 'check' : 'undo'} size={14} /> {open.status === 'OPEN' ? t('support.markAnswered') : t('support.reopen')}
              </button>
            </div>
          )
        }
      >
        {open && (
          <>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink" dir="auto">
              {open.message}
            </p>
            <dl className="mt-6 space-y-3 border-t border-line pt-4 text-sm">
              {[
                [t('support.from'), `${open.name ? `${open.name} · ` : ''}${open.email}`],
                [t('support.workspace'), open.orgName ?? '—'],
                [t('support.page'), open.page ?? '—'],
                [t('support.cols.received'), formatDateTime(open.createdAt, locale)],
                [t('support.browser'), open.userAgent ?? '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-faint">{k}</dt>
                  <dd className="mt-0.5 break-words text-ink">
                    <bdi>{v}</bdi>
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </Sheet>
    </div>
  );
}
