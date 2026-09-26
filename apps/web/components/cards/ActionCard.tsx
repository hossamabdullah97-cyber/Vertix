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

  // Status reflects both the switch and whether the action has a value yet:
  // an enabled action with no destination is not actually usable.
  let statusText = t('links.status.draft');
  let statusClass = 'bg-canvas/50 text-faint border-line/50';
  if (action.isActive) {
    statusText = t('links.status.active');
    statusClass = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25';
  } else if (summary) {
    statusText = t('links.status.hidden');
    statusClass = 'bg-amber-500/10 text-amber-600 border-amber-500/25';
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
      className={`p-3.5 rounded-2xl border transition-all duration-200 relative group flex flex-col ${
        expanded
          ? 'border-accent bg-canvas/30 shadow-sm ring-1 ring-accent-soft'
          : 'border-line/75 bg-canvas/15 hover:border-line hover:bg-canvas/20'
      } ${dragOver ? 'border-dashed border-accent/80 bg-accent/5' : ''}`}
    >
      {/* Header */}
      <div
        onClick={onToggleExpand}
        className="flex items-center justify-between gap-3 cursor-pointer select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="cursor-grab text-faint hover:text-muted transition-colors shrink-0 p-1 active:cursor-grabbing">
            <Icon name="grid" size={13} />
          </span>

          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-transform group-hover:scale-105"
            style={{ background: details?.color ?? '#2563eb' }}
          >
            <Icon name={details.icon} size={16} />
          </span>

          <div className="min-w-0">
            <h4 className="font-extrabold text-xs text-ink flex items-center gap-2 flex-wrap leading-tight">
              <span>{details?.label ?? action.type}</span>
              {summary && (
                <span dir="ltr" className="font-mono text-[10px] text-muted font-normal truncate max-w-[150px] sm:max-w-[200px]">
                  {summary}
                </span>
              )}
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[9.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusClass}`}>
            {statusText}
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleActive();
            }}
            aria-label={t('links.toggleVisibility')}
            title={t('links.toggleVisibility')}
            // The track is 24px by design; `before` stretches the hit area to
            // 44px on a phone without changing how the switch looks.
            className={`relative inline-flex h-6 w-11 sm:h-5 sm:w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-[''] sm:before:hidden ${
              action.isActive ? 'bg-accent' : 'bg-line-strong'
            }`}
            style={action.isActive ? { backgroundColor: 'var(--v-accent)' } : {}}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 sm:h-4 sm:w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                action.isActive ? 'translate-x-5 sm:translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>

          <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 flex items-center gap-1.5 pl-1.5 border-l border-line/60">
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              className="h-11 sm:h-7 px-2.5 rounded-lg flex items-center justify-center border border-line bg-surface hover:bg-elevated text-muted hover:text-ink active:scale-95 transition-all text-[11px] font-bold gap-1"
              title={t('links.duplicate')}
            >
              <Icon name="copy" size={11} /> {t('links.duplicate')}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="h-11 w-11 sm:h-7 sm:w-7 rounded-lg flex items-center justify-center bg-red-500/5 hover:bg-red-500/10 active:scale-95 transition-all text-red-600 border border-red-500/10"
              title={t('links.delete')}
            >
              <Icon name="trash" size={13} />
            </button>
          </div>

          <span className="text-[10px] text-muted font-black w-4 text-center" aria-hidden>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* Body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="grid gap-3 pt-3.5 mt-3.5 border-t border-line/50 overflow-hidden"
          >
            {action.type === 'WHATSAPP' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted uppercase">{t('links.whatsappPhone')}</label>
                  <input
                    dir="ltr"
                    className="v-field font-mono text-xs !h-11 sm:!h-8"
                    defaultValue={(action.config.phone as string) ?? ''}
                    onBlur={(e) => patch('phone', e.target.value)}
                    placeholder={t('links.phonePlaceholder')}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted uppercase">{t('links.whatsappMessage')}</label>
                  <input
                    className="v-field text-xs !h-11 sm:!h-8"
                    defaultValue={(action.config.text as string) ?? ''}
                    onBlur={(e) => patch('text', e.target.value)}
                    placeholder={t('links.whatsappMessagePlaceholder')}
                  />
                </div>
              </div>
            )}

            {action.type === 'CALL' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted uppercase">{t('links.phoneNumber')}</label>
                <input
                  dir="ltr"
                  className="v-field font-mono text-xs !h-11 sm:!h-8"
                  defaultValue={(action.config.phone as string) ?? ''}
                  onBlur={(e) => patch('phone', e.target.value)}
                  placeholder={t('links.phonePlaceholder')}
                />
              </div>
            )}

            {action.type === 'EMAIL' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted uppercase">{t('links.emailAddress')}</label>
                <input
                  dir="ltr"
                  className="v-field font-mono text-xs !h-11 sm:!h-8"
                  defaultValue={(action.config.email as string) ?? ''}
                  onBlur={(e) => patch('email', e.target.value)}
                  placeholder={t('links.emailPlaceholder')}
                />
              </div>
            )}

            {action.type === 'LINKEDIN' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted uppercase">{t('links.linkedinUrl')}</label>
                <input
                  dir="ltr"
                  className="v-field font-mono text-xs !h-11 sm:!h-8"
                  defaultValue={(action.config.url as string) ?? ''}
                  onBlur={(e) => patch('url', e.target.value)}
                  placeholder={t('links.linkedinPlaceholder')}
                />
              </div>
            )}

            {!TYPED_FIELDS.includes(action.type) && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted uppercase">{t('links.destination')}</label>
                <input
                  dir="ltr"
                  className="v-field font-mono text-xs !h-11 sm:!h-8"
                  defaultValue={(action.config.url as string) ?? ''}
                  onBlur={(e) => patch('url', e.target.value)}
                  placeholder={t('links.destinationPlaceholder')}
                />
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-muted font-bold select-none cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked={isQuickAction(action)}
                  onChange={(e) => {
                    const next = { ...(action.config as Record<string, unknown>), isQuick: e.target.checked };
                    onPatchConfig(next);
                  }}
                  className="rounded border-line text-accent focus:ring-accent-soft h-3.5 w-3.5"
                />
                <span>{t('links.quickContact')}</span>
              </label>

              {/* Any action can be the NFC target — previously only grid links could. */}
              <label className="flex items-center gap-2 text-xs text-muted font-bold select-none cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked={action.config.isPrimary === true}
                  onChange={(e) => {
                    const next = { ...(action.config as Record<string, unknown>), isPrimary: e.target.checked };
                    onPatchConfig(next);
                  }}
                  className="rounded border-line text-accent focus:ring-accent-soft h-3.5 w-3.5"
                />
                <span>{t('links.primaryRedirect')}</span>
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
