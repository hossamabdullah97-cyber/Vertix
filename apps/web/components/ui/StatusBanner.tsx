'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { StatusIncidentView, StatusView } from '@vertex/shared';
import { API_URL } from '@/lib/api';
import { Icon } from '@/components/Icon';

const EVERY_MS = 5 * 60_000;
const DISMISSED = 'vx:status-dismissed';

/** What to say in the app: an incident going on now, else maintenance starting within a day. */
export function bannerIncident(v: StatusView, now = Date.now()): StatusIncidentView | null {
  const going = v.active.find((i) => i.status !== 'SCHEDULED' || (i.startsAt && new Date(i.startsAt).getTime() <= now));
  if (going) return going;
  return v.active.find((i) => i.startsAt && new Date(i.startsAt).getTime() - now < 86_400_000) ?? null;
}

/**
 * A line above every page while something is wrong or maintenance is near,
 * so nobody wonders whether the problem is on their side. It links to the
 * status page and can be put away until the next incident.
 */
export function StatusBanner() {
  const { t, i18n } = useTranslation('nav');
  const [incident, setIncident] = useState<StatusIncidentView | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISSED));
    } catch {}
    let stop = false;
    const load = () =>
      fetch(`${API_URL}/status`, { cache: 'no-store' })
        .then((r) => (r.ok ? (r.json() as Promise<StatusView>) : null))
        .then((v) => !stop && setIncident(v ? bannerIncident(v) : null))
        .catch(() => {});
    void load();
    const timer = setInterval(load, EVERY_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  if (!incident || dismissed === incident.id) return null;
  const title = (i18n.language.startsWith('ar') && incident.titleAr) || incident.title;
  const upcoming = incident.status === 'SCHEDULED' && incident.startsAt && new Date(incident.startsAt).getTime() > Date.now();
  const tone =
    incident.impact === 'MAINTENANCE'
      ? 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-100'
      : incident.impact === 'MAJOR'
        ? 'border-red-200 bg-red-50 text-red-950 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100'
        : 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100';

  return (
    <div role="status" data-testid="status-banner" className={`flex items-center gap-3 border-b px-5 py-2.5 text-sm md:px-8 ${tone}`}>
      <Icon name={incident.impact === 'MAINTENANCE' ? 'settings' : 'alert'} size={15} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{upcoming ? t('statusBanner.upcoming') : incident.impact === 'MAINTENANCE' ? t('statusBanner.maintenance') : t('statusBanner.incident')}</span>{' '}
        <span dir="auto">{title}</span>{' '}
        <Link href="/status" className="font-semibold underline underline-offset-2">
          {t('statusBanner.details')}
        </Link>
      </span>
      <button
        type="button"
        aria-label={t('statusBanner.dismiss')}
        className="v-hit shrink-0 opacity-70 hover:opacity-100"
        onClick={() => {
          setDismissed(incident.id);
          try {
            sessionStorage.setItem(DISMISSED, incident.id);
          } catch {}
        }}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
