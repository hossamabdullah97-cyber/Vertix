'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate, formatRelativeTime } from '@/lib/format';
import { Icon } from '@/components/Icon';

interface AuditEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { name: string | null; email: string } | null;
}

/** "member.role_changed" → icon by subject. */
function iconFor(action: string) {
  const subject = action.split('.')[0];
  if (subject === 'member') return 'user';
  if (subject === 'team' || subject === 'department') return 'users';
  if (subject === 'apikey' || subject === 'webhook') return 'lock';
  if (subject === 'integration' || subject === 'crm' || subject === 'automation') return 'layers';
  if (subject === 'org') return 'palette';
  return 'clock';
}

/** Who did what, newest first, grouped by day. Owners and admins only, like the API. */
export function ActivityView() {
  const { t } = useTranslation('teams');
  const { locale } = useLocale();
  const [logs, setLogs] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    authFetch<AuditEntry[]>('/orgs/audit-logs')
      .then(setLogs)
      .catch((e) => {
        setLogs([]);
        setError((e as Error).message);
      });
  }, []);

  const days = useMemo(() => {
    const by = new Map<string, AuditEntry[]>();
    for (const l of logs ?? []) {
      const k = l.createdAt.slice(0, 10);
      by.set(k, [...(by.get(k) ?? []), l]);
    }
    return [...by.entries()];
  }, [logs]);

  // A readable name for an action, falling back to its own words for ones added later.
  const describe = (a: string) => t(`activity.actions.${a.replace('.', '_')}`, a.replace(/[._]/g, ' '));
  const target = (l: AuditEntry) => {
    const m = l.metadata ?? {};
    return (m.email as string) || (m.name as string) || '';
  };

  if (logs === null) return <div className="v-skeleton mt-4 h-64 w-full rounded-xl" />;
  if (error) return <p className="mt-4 text-[13px] text-muted">{error}</p>;
  if (logs.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-line px-6 py-12 text-center">
        <p className="text-[13.5px] text-muted">{t('activity.empty')}</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {days.map(([day, entries]) => (
        <section key={day} className="v-card overflow-hidden">
          <h2 className="border-b border-line px-4 py-2.5 text-[12.5px] font-medium text-faint">{formatDate(`${day}T12:00:00Z`, locale, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <ul className="divide-y divide-line">
            {entries.map((l) => {
              const who = l.actor ? l.actor.name || l.actor.email : t('activity.system');
              const what = target(l);
              return (
                <li key={l.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="v-icon-tile !h-8 !w-8 shrink-0">
                    <Icon name={iconFor(l.action)} size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] text-ink">
                      <span className="font-medium">{who}</span> <span className="text-muted">{describe(l.action)}</span>
                      {what && (
                        <>
                          {' '}
                          <span dir="auto" className="text-ink">
                            {what}
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                  <time dateTime={l.createdAt} title={formatDate(l.createdAt, locale, { dateStyle: 'medium', timeStyle: 'short' } as Intl.DateTimeFormatOptions)} className="shrink-0 whitespace-nowrap text-[12px] text-faint">
                    {formatRelativeTime(l.createdAt, locale, 'short')}
                  </time>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
