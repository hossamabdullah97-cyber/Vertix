'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { type Lead, type Stage, type LeadActivity, type ActivityType, ACTIVITY_META, sourceMeta, initials, hueFor, relativeTime, formatMoney } from '@/lib/crm';

interface FlatActivity extends LeadActivity {
  leadId: string;
  leadName: string;
  leadCompany: string | null;
}

export function ActivitiesTimeline({
  leads,
  stages,
  onOpenLead,
}: {
  leads: Lead[];
  stages: Stage[];
  onOpenLead: (id: string) => void;
}) {
  const { t } = useTranslation('crm');
  const [filterType, setFilterType] = useState<ActivityType | 'ALL'>('ALL');

  // Timeline of real lead-capture events. There is no per-lead activity API yet,
  // so we surface the one event we actually have — the capture — with its real
  // timestamp, source and (if set) deal value. No invented calls or stage changes.
  const activities = useMemo(() => {
    const list: FlatActivity[] = [];
    for (const l of leads) {
      const valuePart = l.value > 0 ? t('activity.dealValue', { value: formatMoney(l.value) }) : '';
      list.push({
        id: `create-${l.id}`,
        type: 'SCAN',
        metadata: { note: `${t('activity.capturedVia', { source: sourceMeta(l.source).label })}${valuePart}` },
        createdAt: l.createdAt,
        leadId: l.id,
        leadName: l.name || t('table.unknownLead'),
        leadCompany: l.company,
      });
    }
    return list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [leads, t]);

  const filtered = useMemo(() => {
    if (filterType === 'ALL') return activities;
    return activities.filter((a) => a.type === filterType);
  }, [activities, filterType]);

  const types: (ActivityType | 'ALL')[] = ['ALL', 'NOTE', 'CALL', 'EMAIL', 'MEETING', 'STAGE_CHANGE', 'SCAN'];

  return (
    <div className="space-y-6">
      {/* Header and Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h2 className="text-[16px] font-bold text-ink">{t('activity.title')}</h2>
          <p className="text-[12.5px] text-muted">{t('activity.subtitle')}</p>
        </div>
        
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-canvas/50 p-0.5">
          {types.map((ty) => {
            const active = filterType === ty;
            const meta = ty !== 'ALL' ? ACTIVITY_META[ty] : null;
            return (
              <button
                key={ty}
                onClick={() => setFilterType(ty)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition-all"
                style={
                  active
                    ? {
                        background: meta ? meta.color + '1c' : 'var(--v-accent-soft)',
                        color: meta ? meta.color : 'var(--v-accent)',
                      }
                    : { color: 'hsl(var(--v-muted))' }
                }
              >
                {meta && <Icon name={meta.icon} size={13} />}
                {ty === 'ALL' ? t('activity.all') : t(`activity.types.${ty}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Timeline Stream */}
      {filtered.length === 0 ? (
        <div className="v-card flex flex-col items-center gap-4 py-20 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-canvas text-faint">
            <Icon name="clock" size={28} />
          </span>
          <div>
            <p className="text-[15px] font-bold text-ink">{t('activity.noMatch')}</p>
            <p className="mt-1 text-[12.5px] text-muted">{t('activity.noMatchDesc')}</p>
          </div>
        </div>
      ) : (
        <div className="relative border-s border-line ps-6 space-y-6">
          <AnimatePresence initial={false}>
            {filtered.map((a, index) => {
              const meta = ACTIVITY_META[a.type] || { label: t('activity.fallback'), icon: 'sparkle', color: 'var(--v-accent)' };
              const typeLabel = t(`activity.types.${a.type}`, t('activity.fallback'));
              const hue = hueFor(a.leadName);
              const noteText = (a.metadata?.note as string) || '';

              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.2) }}
                  className="group relative"
                >
                  {/* Bullet */}
                  <span
                    className="absolute -start-[33px] top-1 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-ink transition-transform group-hover:scale-110"
                    style={{ color: meta.color, boxShadow: 'var(--v-shadow-sm)' }}
                  >
                    <Icon name={meta.icon} size={12} />
                  </span>

                  <div className="v-card p-4 transition-all hover:border-line-strong hover:shadow-md">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => onOpenLead(a.leadId)}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white transition-opacity hover:opacity-90"
                          style={{ background: `hsl(${hue} 62% 48%)` }}
                        >
                          {initials(a.leadName)}
                        </button>
                        <div>
                          <button
                            onClick={() => onOpenLead(a.leadId)}
                            className="text-[13px] font-bold text-ink hover:text-accent"
                          >
                            {a.leadName}
                          </button>
                          {a.leadCompany && (
                            <span className="text-[11px] font-semibold text-muted"> · {a.leadCompany}</span>
                          )}
                        </div>
                      </div>

                      <span className="text-[11px] font-semibold text-faint">{relativeTime(a.createdAt)}</span>
                    </div>

                    <div className="mt-3">
                      <span className="v-chip !px-2 !py-0.5 !text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: meta.color, backgroundColor: meta.color + '0c', borderColor: meta.color + '1a' }}>
                        {typeLabel}
                      </span>
                      <p className="text-[13px] text-muted leading-relaxed whitespace-pre-wrap">{noteText}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
