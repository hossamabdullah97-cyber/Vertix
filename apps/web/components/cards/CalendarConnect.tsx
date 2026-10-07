'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { Icon } from '@/components/Icon';

interface CalendarStatus {
  available: boolean;
  mine: boolean;
  owner: string | null;
  google: { status: 'CONNECTED' | 'REQUIRES_REAUTH' | 'ERROR' | string; account: string | null; problem: string | null } | null;
}

/**
 * The card owner's own Google Calendar: meeting requests are held on it and
 * its busy times are never offered. The owner connects it here; anyone else
 * editing the card sees whether it is connected.
 */
export function CalendarConnect({ cardId }: { cardId: string }) {
  const { t } = useTranslation('cardEditor');
  const [state, setState] = useState<CalendarStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [just, setJust] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    authFetch<CalendarStatus>(`/calendar?cardId=${encodeURIComponent(cardId)}`)
      .then((s) => alive && setState(s))
      .catch(() => alive && setState(null));
    // Back from Google: say so, where it was connected from.
    const url = new URL(window.location.href);
    if (url.searchParams.get('connected') === 'google_calendar') {
      setJust(true);
      url.searchParams.delete('connected');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      setTimeout(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
    return () => {
      alive = false;
    };
  }, [cardId]);

  if (!state?.available) return null;

  async function connect() {
    setBusy(true);
    setFailed(false);
    try {
      const back = window.location.pathname + window.location.search;
      const { url } = await authFetch<{ url: string }>(`/calendar/google/authorize?returnTo=${encodeURIComponent(back)}`);
      window.location.href = url;
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await authFetch('/calendar/google/disconnect', { method: 'POST' });
      setState((s) => (s ? { ...s, google: null } : s));
      setJust(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const g = state.google;
  const connected = g?.status === 'CONNECTED';
  const stale = !!g && !connected;

  return (
    <div ref={box} className="flex items-start gap-3 rounded-xl px-3.5 py-3 ring-1 ring-inset ring-line" data-testid="calendar-connect">
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${connected ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-elevated text-muted'}`}>
        <Icon name="calendar" size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{t('calendar.title')}</p>
        <p className="mt-0.5 text-xs leading-snug text-faint">
          {!state.mine
            ? connected
              ? t('calendar.ownerConnected', { name: state.owner })
              : t('calendar.ownerNot', { name: state.owner })
            : connected
              ? t('calendar.connectedAs', { account: g?.account ? `\u2068${g.account}\u2069` : t('calendar.yourAccount') })
              : stale
                ? t('calendar.reconnectHint')
                : t('calendar.hint')}
        </p>
        {just && connected && <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">{t('calendar.justConnected')}</p>}
        {failed && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{t('calendar.failed')}</p>}
      </div>
      {state.mine && (
        <div className="shrink-0">
          {connected ? (
            <button type="button" onClick={disconnect} disabled={busy} className="v-btn v-btn-ghost !h-9 !text-xs">
              {t('calendar.disconnect')}
            </button>
          ) : (
            <button type="button" onClick={connect} disabled={busy} className="v-btn !h-9 !text-xs">
              {stale ? t('calendar.reconnect') : t('calendar.connect')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
