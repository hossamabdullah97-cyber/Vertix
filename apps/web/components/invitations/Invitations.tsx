'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch, getToken } from '@/lib/client';
import { openWorkspace } from '@/lib/switch';
import { formatRelativeTime } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { OrgMark } from '@/components/OrgMark';

export interface Invitation {
  org: { id: string; name: string; slug: string; kind?: 'PERSONAL' | 'TEAM'; branding?: Record<string, unknown> | null };
  role: string;
  invitedAt: string;
}

/** Fired when an invitation is answered, so every list of them reloads. */
export const INVITES_CHANGED = 'vertex:invites-changed';

/** The invitations waiting on the signed-in person. */
export function useInvitations() {
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(() => {
    if (!getToken()) return;
    authFetch<Invitation[]>('/invitations')
      .then((list) => setInvites(Array.isArray(list) ? list : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(INVITES_CHANGED, load);
    return () => window.removeEventListener(INVITES_CHANGED, load);
  }, [load]);
  return { invites, loaded };
}

/**
 * Each invitation with its answer: join, which opens the workspace, or
 * decline, which tells it no. Nothing changes until one is chosen.
 */
export function InvitationList({ invites, compact = false }: { invites: Invitation[]; compact?: boolean }) {
  const { t } = useTranslation('nav');
  const { locale } = useLocale();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);

  async function answer(inv: Invitation, accept: boolean) {
    setBusy(inv.org.id + (accept ? ':a' : ':d'));
    setError(null);
    try {
      await authFetch(`/invitations/${encodeURIComponent(inv.org.id)}/${accept ? 'accept' : 'decline'}`, { method: 'POST' });
      if (accept) {
        window.dispatchEvent(new Event(INVITES_CHANGED));
        openWorkspace(inv.org.id, inv.org.slug, '/dashboard');
        return;
      }
      window.dispatchEvent(new Event(INVITES_CHANGED));
    } catch (e) {
      setError({ id: inv.org.id, text: (e as Error).message || t('invitations.failed') });
      // A closed invitation is gone from the list too.
      window.dispatchEvent(new Event(INVITES_CHANGED));
    }
    setBusy(null);
  }

  return (
    <ul className={`divide-y divide-line rounded-xl text-start ring-1 ring-inset ring-line ${compact ? '' : 'bg-surface'}`}>
      {invites.map((inv) => (
        <li key={inv.org.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
          <OrgMark name={inv.org.name} branding={inv.org.branding} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{inv.org.name}</p>
            <p className="text-xs text-muted">
              {t('invitations.as', { role: t(`teams:roles.${inv.role}.name`, { defaultValue: inv.role }) })}
              {' · '}
              {formatRelativeTime(inv.invitedAt, locale)}
            </p>
            {error?.id === inv.org.id && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error.text}</p>}
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => answer(inv, false)} disabled={!!busy} className="v-btn v-btn-ghost disabled:opacity-50">
              {busy === inv.org.id + ':d' ? t('invitations.declining') : t('invitations.decline')}
            </button>
            <button type="button" onClick={() => answer(inv, true)} disabled={!!busy} className="v-btn disabled:opacity-50">
              {busy === inv.org.id + ':a' ? t('invitations.joining') : t('invitations.accept')}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
