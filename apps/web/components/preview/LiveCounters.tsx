'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { authFetch } from '@/lib/client';

interface Metric {
  key: string;
  icon: string;
  accentDot: string;
}

/** Labels live in the `cardEditor` namespace under `engagement.metrics.<key>`. */
const METRICS: Metric[] = [
  { key: 'VIEW', icon: 'eye', accentDot: '#2563eb' },
  { key: 'SAVE', icon: 'user-plus', accentDot: '#22c55e' },
  { key: 'NFC_SCAN', icon: 'sparkle', accentDot: '#f59e0b' },
  { key: 'SHARE', icon: 'qr', accentDot: '#0ea5e9' },
  { key: 'CLICK', icon: 'link', accentDot: '#ec4899' },
];

/**
 * Lifetime engagement for this card, counted from the events the public page
 * records. Shows zeros until the card is published and actually visited.
 */
export function LiveCounters({ cardId }: { cardId: string }) {
  const { t } = useTranslation('cardEditor');
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let alive = true;
    authFetch<Record<string, number>>(`/analytics/cards/${cardId}`)
      .then((d) => alive && setCounts(d))
      .catch(() => alive && setCounts(null));
    return () => {
      alive = false;
    };
  }, [cardId]);

  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="v-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold tracking-tight">{t('engagement.title')}</h3>
        <span className="v-badge v-badge-neutral">{t('engagement.allTime')}</span>
      </div>
      {counts && total === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-canvas/40 px-3 py-4 text-center text-[11.5px] text-muted">
          {t('engagement.empty')}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {METRICS.map((m, i) => (
            <motion.div
              key={m.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-xl border border-line bg-canvas/50 p-2.5"
            >
              <div className="mb-1 flex items-center gap-1.5 text-muted">
                <span style={{ color: m.accentDot }}>
                  <Icon name={m.icon} size={13} />
                </span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-wide">
                  {t(`engagement.metrics.${m.key}`)}
                </span>
              </div>
              <p className="text-[19px] font-bold tabular-nums leading-none text-ink">
                {counts ? (counts[m.key] ?? 0).toLocaleString() : '—'}
              </p>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
