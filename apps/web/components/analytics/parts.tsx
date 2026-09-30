'use client';

import Link from 'next/link';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber } from '@/lib/format';

/** Title row of an analytics panel, the same shape as the panels on Home. */
export function PanelHeader({ title, meta, action }: { title: string; meta?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {meta && <span className="tabular text-xs text-faint">{meta}</span>}
      {action && <span className="ms-auto">{action}</span>}
    </div>
  );
}

/** A number that may still be loading (undefined) or be unavailable (null). */
export function Num({ value }: { value: number | null | undefined }) {
  const { locale } = useLocale();
  if (value === undefined) return <span className="v-skeleton inline-block h-3.5 w-7 align-middle" />;
  if (value === null) return <span className="text-faint">—</span>;
  return <>{formatNumber(value, locale)}</>;
}

export interface BarRow {
  key: string;
  label: React.ReactNode;
  value: number;
  /** Shown after the value, e.g. a share or a money amount. */
  aside?: React.ReactNode;
  href?: string;
}

/**
 * Ranked rows with a quiet bar behind each label, sized against the largest
 * value (or `max` when the rows are shares of a known whole).
 */
export function BarList({ rows, max }: { rows: BarRow[]; max?: number }) {
  const { locale } = useLocale();
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1 px-2 pb-3">
      {rows.map((r) => {
        const width = `${Math.max(r.value > 0 ? 2 : 0, (r.value / top) * 100)}%`;
        const body = (
          <>
            <span className="absolute inset-y-0 start-0 rounded-md bg-accent/[0.09] dark:bg-accent/[0.16]" style={{ width }} aria-hidden />
            <span className="relative min-w-0 flex-1 truncate text-ink">{r.label}</span>
            <span className="tabular relative shrink-0 text-ink">{formatNumber(r.value, locale)}</span>
            {r.aside !== undefined && <span className="tabular relative min-w-12 shrink-0 text-end text-xs text-faint">{r.aside}</span>}
          </>
        );
        const cls = 'relative flex min-h-11 items-center gap-3 rounded-md px-2.5 sm:min-h-9 text-sm';
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} className={`${cls} hover:bg-elevated`}>
                {body}
              </Link>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** What a panel says when its period has nothing in it, with an optional way forward. */
export function PanelEmpty({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="px-4 pb-6 pt-2">
      <p className="text-sm leading-relaxed text-muted">{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
