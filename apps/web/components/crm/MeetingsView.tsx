'use client';

import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { type Lead } from '@/lib/crm';

/**
 * Meetings — roadmap. There is no meetings API yet: scheduling and outcomes
 * can't be persisted, so we show an honest placeholder instead of a form that
 * silently forgets everything on reload or fabricated demo meetings.
 */
export function MeetingsView({ leads }: { leads: Lead[]; onOpenLead: (id: string) => void }) {
  const { t } = useTranslation('crm');
  return (
    <div className="space-y-6">
      <section className="v-card overflow-hidden">
        <div className="v-hero p-8">
          <div className="relative z-10 flex flex-col items-start gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur">
              <Icon name="calendar" size={22} />
            </span>
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90">
                {t('meetings.roadmap')}
              </span>
              <h3 className="mt-2 v-display text-[22px] font-extrabold tracking-tight text-white">{t('meetings.title')}</h3>
              <p className="mt-1.5 max-w-lg text-[13px] font-medium text-white/80">
                {t('meetings.desc')}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3 p-6">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="settings" size={14} />
          </span>
          <div>
            <p className="text-[12.5px] font-bold text-ink">{t('meetings.whatNeeds')}</p>
            <p className="mt-0.5 text-[12px] font-medium leading-relaxed text-muted">
              {t('meetings.whatNeedsDesc')}
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3 rounded-xl border border-line bg-elevated/50 p-4 text-[12px] font-medium text-muted">
        <Icon name="users" size={15} className="shrink-0 text-accent" />
        {t('meetings.pipelineBefore')} <span className="font-bold text-ink">{leads.length}</span> {t('meetings.pipelineAfter')}
      </div>
    </div>
  );
}
