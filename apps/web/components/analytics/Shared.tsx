'use client';

import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';

/**
 * Shared analytics primitives — a panel shell and honest empty / not-yet-tracked
 * states. Used across the analytics tabs so every surface reads as one system
 * and never fabricates data that the backend does not actually capture.
 */

export function Panel({
  title,
  subtitle,
  icon,
  action,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`v-card p-6 ${className}`}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {icon && (
            <span className="v-icon-tile">
              <Icon name={icon} size={16} />
            </span>
          )}
          <div>
            <h3 className="text-[15px] font-extrabold tracking-tight text-ink">{title}</h3>
            {subtitle && <p className="text-[11.5px] font-medium text-muted">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Honest empty state — shown when real data exists but the period has none. */
export function EmptyState({ icon = 'search', message }: { icon?: string; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-14 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-canvas text-faint">
        <Icon name={icon} size={20} />
      </span>
      <p className="max-w-sm px-6 text-xs font-semibold text-muted">{message}</p>
    </div>
  );
}

/**
 * Honest "not yet tracked" state for signals the platform does not capture yet
 * (e.g. geo, demographics). We are explicit about what is missing instead of
 * rendering fabricated charts — Vertex Connect is production, not a demo.
 */
export function NotTracked({
  title,
  icon = 'sparkle',
  reason,
  requirement,
}: {
  title: string;
  icon?: string;
  reason: string;
  requirement: string;
}) {
  const { t } = useTranslation('analytics');
  return (
    <section className="v-card overflow-hidden">
      <div className="v-hero p-8">
        <div className="relative z-10 flex flex-col items-start gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur">
            <Icon name={icon} size={22} />
          </span>
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90">
              {t('notTracked.roadmap')}
            </span>
            <h3 className="mt-2 v-display text-[22px] font-extrabold tracking-tight text-white">{title}</h3>
            <p className="mt-1.5 max-w-lg text-[13px] font-medium text-white/80">{reason}</p>
          </div>
        </div>
      </div>
      <div className="flex items-start gap-3 p-6">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon name="settings" size={14} />
        </span>
        <div>
          <p className="text-[12.5px] font-bold text-ink">{t('notTracked.whatNeeds')}</p>
          <p className="mt-0.5 text-[12px] font-medium leading-relaxed text-muted">{requirement}</p>
        </div>
      </div>
    </section>
  );
}
