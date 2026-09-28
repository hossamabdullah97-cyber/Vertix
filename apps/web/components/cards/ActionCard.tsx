'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import type { CardAction } from '@/lib/client';

export interface ActionBrand {
  label: string;
  arLabel?: string;
  color: string;
  icon: string;
  desc?: string;
}

/** Types whose value lives in a dedicated config field rather than `url`. */
const TYPED_FIELDS = ['WHATSAPP', 'LINKEDIN', 'CALL', 'EMAIL'];

/** Whether an action defaults to the quick-contact row when it has no explicit flag. */
export function isQuickAction(a: CardAction): boolean {
  if (typeof a.config.isQuick === 'boolean') return a.config.isQuick;
  return ['CALL', 'EMAIL', 'WHATSAPP'].includes(a.type);
}

/** The single value a card summarises in its collapsed header. */
export function actionSummary(a: CardAction): string {
  const c = a.config as Record<string, unknown>;
  return ((c.phone || c.email || c.url || '') as string) ?? '';
}

/**
 * One editable action row. This is the only implementation — the quick-contact
 * row and the links grid both render it, so a change here applies to both.
 */
export default function ActionCard({
  action,
  details,
  expanded,
  dragOver,
  onToggleExpand,
  onToggleActive,
  onPatchConfig,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDragEnd,
  onDrop,
}: {
  action: CardAction;
  details: ActionBrand;
  expanded: boolean;
  dragOver: boolean;
  onToggleExpand: () => void;
  onToggleActive: () => void;
  /** Called with the mutated config; the parent persists it. */
  onPatchConfig: (config: Record<string, unknown>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const { t } = useTranslation('cardEditor');
  const summary = actionSummary(action);

  // An enabled action with no destination is not usable yet, so it reads as a draft.
  let statusText = t('links.status.draft');
  let statusClass = 'v-badge-neutral';
  if (action.isActive && summary) {
    statusText = '';
  } else if (action.isActive) {
    statusClass = 'v-badge-warning';
  } else if (summary) {
    statusText = t('links.status.hidden');
  }

  const patch = (key: string, value: string) => {
    const next = { ...(action.config as Record<string, unknown>), [key]: value };
    onPatchConfig(next);
  };

  return (
    <div
      id={`action-card-${action.id}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      className={`group relative flex flex-col transition-colors ${expanded ? 'bg-elevated' : 'bg-surface'} ${
        dragOver ? 'shadow-[inset_0_2px_0_var(--v-accent)]' : ''
      }`}
    >
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        className="flex min-h-14 cursor-pointer select-none items-center gap-3 px-3 py-2.5 outline-none focus-visible:bg-elevated"
      >
        {/* Dragging is a mouse gesture, so the handle only shows where it works. */}
        <span className="hidden shrink-0 cursor-grab text-faint active:cursor-grabbing sm:inline" aria-hidden>
          <Icon name="dots" size={14} className="rotate-90" />
        </span>

        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevated text-ink ring-1 ring-inset ring-line">
          <Icon name={details.icon} size={15} />
        </span>

        <div className="min-w-0 flex-1">
          <p className={`truncate text-[13.5px] font-medium ${action.isActive ? 'text-ink' : 'text-faint'}`}>{details?.label ?? action.type}</p>
          {summary && (
            <p dir="ltr" className="truncate text-start font-mono text-[12px] text-faint rtl:text-right">
              {summary}
            </p>
          )}
        </div>

        {statusText && <span className={`v-badge shrink-0 ${statusClass}`}>{statusText}</span>}

        {/* On a phone these move into the open row, so the closed row stays readable. */}
        <div className="hidden shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 sm:flex">
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-ink"
            title={t('links.duplicate')}
            aria-label={t('links.duplicate')}
          >
            <Icon name="copy" size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-red-500/10 hover:text-red-600"
            title={t('links.delete')}
            aria-label={t('links.delete')}
          >
            <Icon name="trash" size={14} />
          </button>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleActive();
          }}
          role="switch"
          aria-checked={action.isActive}
          aria-label={t('links.toggleVisibility')}
          title={t('links.toggleVisibility')}
          // The track is small by design; `before` stretches the hit area to
          // 44px on a phone without changing how the switch looks.
          className={`relative inline-flex h-[18px] w-[30px] shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent before:absolute before:-inset-3 before:content-[''] sm:before:hidden ${
            action.isActive ? 'bg-accent' : 'bg-line-strong'
          }`}
          style={action.isActive ? undefined : { background: 'hsl(var(--v-border-strong))' }}
        >
          <span
            className={`pointer-events-none absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-[inset-inline-start] ${
              action.isActive ? 'start-[14px]' : 'start-[2px]'
            }`}
          />
        </button>

        <span className={`shrink-0 text-faint transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden>
          <Icon name="chevron-down" size={15} />
        </span>
      </div>

      {/* Body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="grid gap-3 overflow-hidden px-3 pb-3.5 sm:ps-[70px]"
          >
            {action.type === 'WHATSAPP' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[12px] text-muted">{t('links.whatsappPhone')}</label>
                  <input
                    dir="ltr"
                    className="v-field font-mono !text-[12.5px] rtl:text-right"
                    defaultValue={(action.config.phone as string) ?? ''}
                    onBlur={(e) => patch('phone', e.target.value)}
                    placeholder={t('links.phonePlaceholder')}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] text-muted">{t('links.whatsappMessage')}</label>
                  <input
                    className="v-field !text-[13px]"
                    defaultValue={(action.config.text as string) ?? ''}
                    onBlur={(e) => patch('text', e.target.value)}
                    placeholder={t('links.whatsappMessagePlaceholder')}
                  />
                </div>
              </div>
            )}

            {action.type === 'CALL' && (
              <div className="space-y-1">
                <label className="text-[12px] text-muted">{t('links.phoneNumber')}</label>
                <input
                  dir="ltr"
                  className="v-field font-mono !text-[12.5px] rtl:text-right"
                  defaultValue={(action.config.phone as string) ?? ''}
                  onBlur={(e) => patch('phone', e.target.value)}
                  placeholder={t('links.phonePlaceholder')}
                />
              </div>
            )}

            {action.type === 'EMAIL' && (
              <div className="space-y-1">
                <label className="text-[12px] text-muted">{t('links.emailAddress')}</label>
                <input
                  dir="ltr"
                  className="v-field font-mono !text-[12.5px] rtl:text-right"
                  defaultValue={(action.config.email as string) ?? ''}
                  onBlur={(e) => patch('email', e.target.value)}
                  placeholder={t('links.emailPlaceholder')}
                />
              </div>
            )}

            {action.type === 'LINKEDIN' && (
              <div className="space-y-1">
                <label className="text-[12px] text-muted">{t('links.linkedinUrl')}</label>
                <input
                  dir="ltr"
                  className="v-field font-mono !text-[12.5px] rtl:text-right"
                  defaultValue={(action.config.url as string) ?? ''}
                  onBlur={(e) => patch('url', e.target.value)}
                  placeholder={t('links.linkedinPlaceholder')}
                />
              </div>
            )}

            {!TYPED_FIELDS.includes(action.type) && (
              <div className="space-y-1">
                <label className="text-[12px] text-muted">{t('links.destination')}</label>
                <input
                  dir="ltr"
                  className="v-field font-mono !text-[12.5px] rtl:text-right"
                  defaultValue={(action.config.url as string) ?? ''}
                  onBlur={(e) => patch('url', e.target.value)}
                  placeholder={t('links.destinationPlaceholder')}
                />
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <label className="flex min-h-11 cursor-pointer select-none items-center gap-2.5 text-[13px] text-muted sm:min-h-0">
                <input
                  type="checkbox"
                  defaultChecked={isQuickAction(action)}
                  onChange={(e) => {
                    const next = { ...(action.config as Record<string, unknown>), isQuick: e.target.checked };
                    onPatchConfig(next);
                  }}
                  className="h-4 w-4 rounded accent-[var(--v-accent)]"
                />
                <span>{t('links.quickContact')}</span>
              </label>

              {/* Any action can be the NFC target — previously only grid links could. */}
              <label className="flex min-h-11 cursor-pointer select-none items-center gap-2.5 text-[13px] text-muted sm:min-h-0">
                <input
                  type="checkbox"
                  defaultChecked={action.config.isPrimary === true}
                  onChange={(e) => {
                    const next = { ...(action.config as Record<string, unknown>), isPrimary: e.target.checked };
                    onPatchConfig(next);
                  }}
                  className="h-4 w-4 rounded accent-[var(--v-accent)]"
                />
                <span>{t('links.primaryRedirect')}</span>
              </label>
            </div>

            <div className="flex gap-2 border-t border-line pt-3 sm:hidden">
              <button onClick={onDuplicate} className="v-btn v-btn-ghost !h-11 flex-1">
                <Icon name="copy" size={14} /> {t('links.duplicate')}
              </button>
              <button onClick={onDelete} className="v-btn v-btn-ghost !h-11 flex-1 !text-red-600">
                <Icon name="trash" size={14} /> {t('links.delete')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
