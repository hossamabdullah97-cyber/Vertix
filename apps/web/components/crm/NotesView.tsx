'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TeamNote } from '@vertex/shared';
import { authFetch, type Me } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate, formatRelativeTime } from '@/lib/format';
import { avatarColor, initials } from '@/lib/crm';
import { NoteText } from './MentionInput';

type Filter = 'all' | 'mentions' | 'mine';

/** Notes this browser kept before notes were shared (the old Notes tab). */
const LOCAL_KEY = 'vertex_crm_notes';
interface LocalNote {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

function readLocal(): LocalNote[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as LocalNote[]).filter((n) => n.content?.trim() || n.title?.trim()) : [];
  } catch {
    return [];
  }
}

/**
 * The team's notes on its leads, newest first: all of them, the ones naming
 * you, or your own. Each opens its lead, where it can be answered or changed.
 * Notes are written on a lead (its Activity tab), so they are never orphaned.
 */
export function NotesView({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  const [filter, setFilter] = useState<Filter>('all');
  const [notes, setNotes] = useState<TeamNote[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [local, setLocal] = useState<LocalNote[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    authFetch<Me>('/auth/me').then(setMe, () => undefined);
    setLocal(readLocal());
  }, []);

  useEffect(() => {
    setNotes(null);
    setError('');
    authFetch<TeamNote[]>(`/leads/notes?filter=${filter}`).then(setNotes, (e) => {
      setNotes([]);
      setError((e as Error).message);
    });
  }, [filter]);

  function forgetLocal(id: string) {
    const rest = local.filter((n) => n.id !== id);
    setLocal(rest);
    try {
      if (rest.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(rest));
      else localStorage.removeItem(LOCAL_KEY);
    } catch {
      // nothing to forget
    }
  }

  const filters: Filter[] = ['all', 'mentions', 'mine'];

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold text-ink">{t('notes.heading')}</h2>
          <p className="mt-1 text-sm text-muted">{t('notes.intro')}</p>
        </div>
        <div role="tablist" aria-label={t('notes.heading')} className="flex gap-1 rounded-lg bg-elevated p-1 ring-1 ring-inset ring-line">
          {filters.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`min-h-9 rounded-md px-3 text-xs font-medium transition-colors ${filter === f ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'}`}
            >
              {t(`notes.filters.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {!notes ? (
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="v-skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="mt-5 rounded-xl px-6 py-12 text-center ring-1 ring-inset ring-line">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-elevated text-muted ring-1 ring-inset ring-line">
            <Icon name="message" size={17} />
          </span>
          <p className="mt-3 text-sm text-muted">{t(`notes.empty.${filter}`)}</p>
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {notes.map((n) => {
            const who = n.author?.name ?? t('notes.someone');
            const mine = !!me && n.author?.id === me.sub;
            return (
              <li key={n.id} data-testid="team-note" className="rounded-xl p-4 ring-1 ring-inset ring-line">
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-2xs font-semibold text-white"
                    style={{ background: avatarColor(who) }}
                  >
                    {initials(who)}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-medium text-ink">{mine ? t('notes.you') : who}</span>
                    <span className="text-muted"> · </span>
                    <button type="button" onClick={() => onOpenLead(n.lead.id)} className="font-medium text-accent hover:underline">
                      {n.lead.name || n.lead.company || t('notes.unnamedLead')}
                    </button>
                  </p>
                  <time dateTime={n.createdAt} title={formatDate(n.createdAt, locale)} className="shrink-0 text-xs text-faint">
                    {n.editedAt && `${t('notes.edited')} · `}
                    {formatRelativeTime(n.createdAt, locale, 'narrow')}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink" dir="auto">
                  <NoteText text={n.note} mentions={n.mentions} me={me?.sub} />
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {local.length > 0 && (
        <section className="mt-8 rounded-xl bg-amber-500/[0.05] p-4 ring-1 ring-inset ring-amber-500/20">
          <h3 className="text-sm font-semibold text-ink">{t('notes.local.title')}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">{t('notes.local.body')}</p>
          <ul className="mt-3 space-y-2">
            {local.map((n) => (
              <li key={n.id} className="rounded-lg bg-surface p-3 ring-1 ring-inset ring-line">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{n.title}</p>
                  <button type="button" onClick={() => forgetLocal(n.id)} className="text-xs text-muted hover:text-red-600">
                    {t('notes.local.delete')}
                  </button>
                </div>
                {n.content && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted">{n.content}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
