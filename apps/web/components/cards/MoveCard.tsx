'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { openWorkspace } from '@/lib/switch';
import { formatNumber } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { OrgMark } from '@/components/OrgMark';

interface Target {
  id: string;
  name: string;
  slug: string;
  kind: 'PERSONAL' | 'TEAM';
  ownerIsMember: boolean;
}
interface Targets {
  allowed: boolean;
  targets: Target[];
  leads: number;
  chips: number;
}

/**
 * Moving the card to another of one's workspaces, with its leads and history.
 * Shown only where the move is allowed and there is somewhere to go.
 */
export function MoveCard({ cardId, cardName }: { cardId: string; cardName: string }) {
  const { t } = useTranslation('cardEditor');
  const { locale } = useLocale();
  const [data, setData] = useState<Targets | null>(null);
  const [to, setTo] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    authFetch<Targets>(`/cards/${encodeURIComponent(cardId)}/move`).then(setData, () => setData(null));
  }, [cardId]);

  if (!data?.allowed || data.targets.length === 0) return null;
  const target = data.targets.find((x) => x.id === to) ?? null;

  async function move() {
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      await authFetch(`/cards/${encodeURIComponent(cardId)}/move`, { method: 'POST', body: JSON.stringify({ orgId: target.id }) });
      // The card now lives there: open it there.
      openWorkspace(target.id, target.slug, `/cards/${cardId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl ring-1 ring-inset ring-line" aria-labelledby="move-card-title">
      <div className="px-4 py-4">
        <h2 id="move-card-title" className="text-base font-semibold text-ink">
          {t('move.title')}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{t('move.hint')}</p>
      </div>
      <div className="space-y-3 border-t border-line px-4 py-3">
        <ul className="space-y-1.5" role="radiogroup" aria-label={t('move.to')}>
          {data.targets.map((x) => (
            <li key={x.id}>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ring-inset transition-colors ${
                  to === x.id ? 'bg-accent/[0.06] ring-2 ring-accent' : 'ring-line hover:bg-elevated'
                } ${x.ownerIsMember ? '' : 'cursor-not-allowed opacity-60'}`}
              >
                <input type="radio" name="move-to" value={x.id} className="sr-only" disabled={!x.ownerIsMember} checked={to === x.id} onChange={() => { setTo(x.id); setConfirming(false); }} />
                <OrgMark name={x.name} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{x.name}</span>
                  <span className="block text-xs text-faint">{x.ownerIsMember ? t(x.kind === 'PERSONAL' ? 'move.kindPersonal' : 'move.kindTeam') : t('move.ownerNotIn')}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        {target && !confirming && (
          <button type="button" onClick={() => setConfirming(true)} className="v-btn">
            {t('move.start', { name: target.name })}
          </button>
        )}

        {target && confirming && (
          <div className="rounded-lg bg-elevated/70 p-3.5 text-sm">
            <p className="font-medium text-ink">{t('move.confirmTitle', { card: cardName, name: target.name })}</p>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-muted">
              <li>{t('move.leads', { count: data.leads, value: formatNumber(data.leads, locale) })}</li>
              <li>{t('move.history')}</li>
              {data.chips > 0 && <li>{t('move.chips', { count: data.chips, value: formatNumber(data.chips, locale) })}</li>}
              <li>{t('move.link')}</li>
            </ul>
            {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void move()} disabled={busy} className="v-btn disabled:opacity-60">
                {busy ? t('move.moving') : t('move.confirm')}
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="v-btn v-btn-ghost">
                {t('move.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
