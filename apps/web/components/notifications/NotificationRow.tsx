'use client';

import { useTranslation } from 'react-i18next';
import { formatDate, formatRelativeTime, formatTime } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { ActionMenu, type ActionItem } from '@/components/ui/ActionMenu';
import { CATEGORY_ICON, bucketOf, describe, linkOf, toneOf, type Notif } from './model';

const TONE: Record<string, string> = {
  accent: 'bg-accent/10 text-accent',
  danger: 'bg-red-500/10 text-red-600 dark:text-red-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  neutral: 'bg-elevated text-muted ring-1 ring-inset ring-line',
};

/** The person behind it, or else the kind of thing it is. */
function Leading({ n, size }: { n: Notif; size: number }) {
  const kind = toneOf(n);
  const icon = kind === 'danger' ? 'alert' : CATEGORY_ICON[n.category] ?? 'bell';
  const tone = TONE[kind];
  if (n.actor) {
    return (
      <span className="relative shrink-0">
        <Avatar user={n.actor} size={size} />
        <span className="absolute -bottom-0.5 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-surface ring-2 ring-surface">
          <span className={`flex h-full w-full items-center justify-center rounded-full ${tone}`}>
            <Icon name={icon} size={9} />
          </span>
        </span>
      </span>
    );
  }
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${tone}`} style={{ width: size, height: size }}>
      <Icon name={icon} size={Math.round(size * 0.45)} />
    </span>
  );
}

export function NotificationRow({
  n,
  compact = false,
  otherWorkspace,
  archived = false,
  onOpen,
  onToggleRead,
  onArchive,
}: {
  n: Notif;
  compact?: boolean;
  /** The workspace's name when it is not the active one. */
  otherWorkspace?: string;
  archived?: boolean;
  onOpen: (n: Notif) => void;
  onToggleRead?: (n: Notif) => void;
  onArchive?: (n: Notif) => void;
}) {
  const { t } = useTranslation('notifications');
  const { locale } = useLocale();
  const { title, body } = describe(n, t, locale);
  const unread = !n.readAt && !archived;
  const href = linkOf(n);
  const recent = Date.now() - new Date(n.createdAt).getTime() < 3_600_000;
  const b = bucketOf(n.createdAt);
  const when =
    compact || recent
      ? formatRelativeTime(n.createdAt, locale, 'short')
      : b === 'today' || b === 'yesterday'
        ? formatTime(n.createdAt, locale)
        : formatDate(n.createdAt, locale, { month: 'short', day: 'numeric' });

  const items: ActionItem[] = [];
  if (href) items.push({ key: 'open', label: t('actions.open'), icon: 'arrow', onSelect: () => onOpen(n) });
  if (onToggleRead && !archived) items.push({ key: 'read', label: n.readAt ? t('actions.markUnread') : t('actions.markRead'), icon: n.readAt ? 'eye-off' : 'check', onSelect: () => onToggleRead(n) });
  if (onArchive && !archived) items.push({ key: 'archive', label: t('actions.archive'), icon: 'inbox', onSelect: () => onArchive(n), separated: items.length > 0 });

  return (
    <div
      role={href ? 'link' : undefined}
      tabIndex={href ? 0 : undefined}
      onClick={() => onOpen(n)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(n);
      }}
      className={`group relative flex items-start gap-3 outline-none transition-colors focus-visible:bg-elevated ${compact ? 'px-4 py-3' : 'px-4 py-3.5 sm:px-5'} ${href ? 'cursor-pointer hover:bg-elevated/70' : ''}`}
    >
      {unread && <span aria-hidden className={`absolute start-1.5 h-1.5 w-1.5 rounded-full bg-accent ${compact ? 'top-[26px]' : 'top-[30px]'}`} />}
      <Leading n={n} size={compact ? 32 : 36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <p className={`min-w-0 flex-1 ${compact ? 'text-sm' : 'text-sm'} leading-snug ${unread ? 'font-medium text-ink' : 'text-ink/80'}`}>
            {unread && <span className="sr-only">{t('tabs.unread')}: </span>}
            {title}
          </p>
          <span className="shrink-0 whitespace-nowrap text-xs text-faint">{when}</span>
        </div>
        {body && (
          <p className={`mt-0.5 text-muted ${compact ? 'truncate text-xs' : 'line-clamp-2 text-sm'}`}>
            {/* Isolated so a name in the other script keeps its order, while the
                line still aligns with the page. */}
            <bdi>{body}</bdi>
          </p>
        )}
        {otherWorkspace && <p className={`${compact ? 'mt-0.5' : 'mt-1'} truncate text-xs text-faint`}>{t('otherWorkspace', { name: `\u2068${otherWorkspace}\u2069` })}</p>}
      </div>
      {!compact && items.length > 0 && (
        <span className="-me-1.5 -mt-1 shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <ActionMenu label={t('more')} items={items} />
        </span>
      )}
    </div>
  );
}
