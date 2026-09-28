'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL } from '@/lib/api';
import { authFetch, getActiveOrgId, getToken } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Avatar } from '@/components/Avatar';

export interface PresentPerson {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

/** How often an open Studio says it is still there; the API counts it for 45 s. */
const BEAT_MS = 20_000;

/**
 * Who else has this card open in the Studio. While the page is visible it
 * refreshes its own presence and gets everyone else's back; a hidden tab stops
 * refreshing and drops out, and closing the page leaves at once.
 */
export function useCardPresence(cardId: string | undefined): PresentPerson[] {
  const [others, setOthers] = useState<PresentPerson[]>([]);

  useEffect(() => {
    if (!cardId) return;
    let alive = true;
    const beat = () =>
      authFetch<PresentPerson[]>(`/cards/${cardId}/presence`, { method: 'PUT' })
        .then((list) => alive && setOthers(list))
        .catch(() => {});
    const leave = () => {
      const token = getToken();
      const org = getActiveOrgId();
      if (!token) return;
      // keepalive lets the request finish while the page is closing.
      fetch(`${API_URL}/cards/${cardId}/presence`, {
        method: 'DELETE',
        keepalive: true,
        headers: { Authorization: `Bearer ${token}`, ...(org ? { 'x-organization-id': org } : {}) },
      }).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') beat();
    };

    beat();
    const timer = setInterval(() => document.visibilityState === 'visible' && beat(), BEAT_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', leave);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [cardId]);

  return others;
}

/** Faces of the others on this card, with a line saying who they are. */
export function PresenceBadge({ people }: { people: PresentPerson[] }) {
  const { t } = useTranslation('cardEditor');
  const { locale } = useLocale();
  if (people.length === 0) return null;

  const nameOf = (p: PresentPerson) => p.name?.trim() || p.email.split('@')[0];
  const shown = people.slice(0, 3);
  const extra = people.length - shown.length;
  const names = new Intl.ListFormat(locale === 'ar' ? 'ar' : 'en', { type: 'conjunction' }).format(people.slice(0, 2).map(nameOf));
  const sentence =
    people.length === 1 ? t('presence.one', { name: names }) : people.length === 2 ? t('presence.two', { names }) : t('presence.many', { names });

  return (
    <span className="flex min-w-0 shrink items-center gap-2 font-normal" title={people.map(nameOf).join('\n')}>
      <span className="flex shrink-0 -space-x-1.5 rtl:space-x-reverse" aria-hidden>
        {shown.map((p, i) => (
          <span key={p.id} className="relative">
            <Avatar user={p} size={22} ring />
            {i === 0 && <span className="absolute -bottom-px -end-px h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-surface" />}
          </span>
        ))}
        {extra > 0 && (
          <span className="tabular flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-elevated px-1 text-[10.5px] font-medium text-muted ring-2 ring-surface">
            +{extra}
          </span>
        )}
      </span>
      <span role="status" className="hidden truncate text-[12.5px] text-muted lg:inline">
        {sentence}
      </span>
      <span className="sr-only lg:hidden">{sentence}</span>
    </span>
  );
}
