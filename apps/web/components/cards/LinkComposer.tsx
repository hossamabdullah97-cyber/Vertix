'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { readableOn } from '@/lib/color';
import type { CardAction } from '@/lib/client';
import { configFor, handlePrefix, inputOf, isQuickAction, quickByDefault, valueOf, valueProblem, type LinkKind } from '@/lib/link-kinds';

/** A kind's mark: its icon on its own colour. */
export function BrandBubble({ kind, size = 36 }: { kind: Pick<LinkKind, 'color' | 'icon'>; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: kind.color, color: readableOn(kind.color) }}
    >
      <Icon name={kind.icon} size={Math.round(size * 0.46)} />
    </span>
  );
}

export interface LinkDraft {
  config: Record<string, unknown>;
}

/**
 * Adding a button, or changing one, in one place: the one thing it needs (a
 * number, an address, a username or a link) is asked for first and checked,
 * then where it sits on the card. The button is only made on "Add to card",
 * so the card never shows one that goes nowhere.
 */
export function LinkComposer({
  kind,
  action,
  initial,
  onClose,
  onSubmit,
  onDelete,
}: {
  /** The kind being added or edited; null closes the dialog. */
  kind: LinkKind | null;
  /** The button being changed; absent when adding. */
  action?: CardAction | null;
  /** What a new one starts from (a link pasted into the Studio's box). */
  initial?: string;
  onClose: () => void;
  onSubmit: (draft: LinkDraft) => Promise<void>;
  onDelete?: () => void;
}) {
  const { t } = useTranslation('cardEditor');
  const { locale } = useLocale();
  const titleId = useId();
  const fieldId = useId();
  const errorId = useId();
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');
  const [quick, setQuick] = useState(false);
  const [primary, setPrimary] = useState(false);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Each opening starts from the button as it is (or empty for a new one).
  const openKey = kind ? `${kind.key}:${action?.id ?? 'new'}:${initial ?? ''}` : null;
  useEffect(() => {
    if (!kind) return;
    const config = (action?.config ?? {}) as Record<string, unknown>;
    setValue(action ? valueOf(kind, config) : (initial ?? ''));
    setMessage(typeof config.text === 'string' ? config.text : '');
    setQuick(action ? isQuickAction(action) : quickByDefault(kind));
    setPrimary(config.isPrimary === true);
    setShown(false);
    setFailed(null);
    setBusy(false);
    const focus = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  useEffect(() => {
    if (!kind) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kind, onClose]);

  const input = kind ? inputOf(kind) : 'none';
  const problem = kind ? valueProblem(kind, value) : null;
  const name = kind ? (locale === 'ar' ? kind.arLabel : kind.label) : '';

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!kind) return;
    setShown(true);
    if (problem) {
      inputRef.current?.focus();
      return;
    }
    const base = { ...((action?.config ?? {}) as Record<string, unknown>) };
    // The value's own keys are replaced whole (a username may have become a link).
    for (const k of ['phone', 'email', 'url', 'query']) delete base[k];
    const config: Record<string, unknown> = { ...base, ...configFor(kind, value), isQuick: quick };
    if (kind.type === 'WHATSAPP') {
      if (message.trim()) config.text = message.trim();
      else delete config.text;
    }
    if (primary) config.isPrimary = true;
    else delete config.isPrimary;
    setBusy(true);
    setFailed(null);
    try {
      await onSubmit({ config });
    } catch (err) {
      setFailed((err as Error).message);
      setBusy(false);
    }
  }

  const placeholder =
    input === 'phone'
      ? t('composer.placeholders.phone')
      : input === 'email'
        ? t('composer.placeholders.email')
        : input === 'handle'
          ? t('composer.placeholders.handle')
          : input === 'place'
            ? t('composer.placeholders.place')
            : t('composer.placeholders.url');

  return (
    <AnimatePresence>
      {kind && (
        <motion.div
          key="composer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[130] flex items-end justify-center bg-canvas/70 backdrop-blur-[2px] sm:items-start sm:px-4 sm:pt-[12vh]"
        >
          <motion.form
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-w-[480px] sm:rounded-2xl"
          >
            <header className="flex items-center gap-3 border-b border-line px-5 py-4">
              <BrandBubble kind={kind} size={40} />
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="truncate text-md font-semibold text-ink">
                  {action ? t('composer.editTitle', { name }) : t('composer.addTitle', { name })}
                </h2>
                <p className="text-xs text-faint">{t(`composer.ask.${input}`)}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('settings.cancel')}
                className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-ink sm:h-8 sm:w-8"
              >
                <Icon name="x" size={16} />
              </button>
            </header>

            <div className="space-y-5 px-5 py-5">
              {input !== 'none' ? (
                <div>
                  <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-ink">
                    {t(`composer.fields.${input}`)}
                  </label>
                  <div
                    dir="ltr"
                    className={`flex items-center overflow-hidden rounded-lg bg-surface ring-1 ring-inset focus-within:ring-2 focus-within:ring-accent ${
                      shown && problem ? 'ring-red-600/70' : 'ring-line-strong'
                    }`}
                  >
                    {input === 'handle' && (
                      <span className="shrink-0 select-none border-e border-line bg-elevated px-3 py-2.5 font-mono text-sm text-faint">{handlePrefix(kind)}</span>
                    )}
                    <input
                      ref={inputRef}
                      id={fieldId}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      onBlur={() => value && setShown(true)}
                      placeholder={placeholder}
                      inputMode={input === 'phone' ? 'tel' : input === 'email' ? 'email' : input === 'place' ? 'text' : 'url'}
                      autoComplete={input === 'phone' ? 'tel' : input === 'email' ? 'email' : 'off'}
                      autoCapitalize="off"
                      spellCheck={false}
                      aria-invalid={(shown && !!problem) || undefined}
                      aria-describedby={shown && problem ? errorId : undefined}
                      className={`h-12 min-w-0 flex-1 bg-transparent px-3 text-base text-ink outline-none placeholder:text-faint sm:h-11 sm:text-sm ${input === 'place' ? 'text-start' : ''}`}
                      dir={input === 'place' ? 'auto' : 'ltr'}
                    />
                  </div>
                  {shown && problem ? (
                    <p id={errorId} className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                      {t(`composer.problems.${problem}`)}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-faint">{t(`composer.hints.${input}`)}</p>
                  )}
                </div>
              ) : (
                <p className="rounded-lg bg-elevated px-3.5 py-3 text-sm text-muted">{t('composer.saveContactHint')}</p>
              )}

              {kind.type === 'WHATSAPP' && (
                <div>
                  <label htmlFor={`${fieldId}-msg`} className="mb-1.5 block text-sm font-medium text-ink">
                    {t('links.whatsappMessage')} <span className="font-normal text-faint">({t('sections.optional')})</span>
                  </label>
                  <input
                    id={`${fieldId}-msg`}
                    className="v-field"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t('links.whatsappMessagePlaceholder')}
                  />
                </div>
              )}

              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink">{t('composer.where')}</legend>
                <div className="grid grid-cols-2 gap-2.5">
                  {([true, false] as const).map((q) => (
                    <button
                      key={String(q)}
                      type="button"
                      role="radio"
                      aria-checked={quick === q}
                      onClick={() => setQuick(q)}
                      className={`flex flex-col items-start gap-2 rounded-xl p-3 text-start transition-colors ${
                        quick === q ? 'bg-accent/[0.06] ring-2 ring-inset ring-accent' : 'ring-1 ring-inset ring-line hover:bg-elevated'
                      }`}
                    >
                      <PlacementSketch quick={q} color={kind.color} />
                      <span className="text-sm font-medium text-ink">{t(q ? 'composer.quick' : 'composer.list')}</span>
                      <span className="text-xs leading-snug text-faint">{t(q ? 'composer.quickHint' : 'composer.listHint')}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              {action && (
                <label className="flex min-h-11 cursor-pointer select-none items-start gap-2.5 text-sm text-muted">
                  <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-[var(--v-accent)]" />
                  <span>{t('links.primaryRedirect')}</span>
                </label>
              )}

              {failed && (
                <p role="alert" className="rounded-lg bg-red-500/[0.06] px-3 py-2 text-sm text-red-700 dark:text-red-300">
                  {failed}
                </p>
              )}
            </div>

            <footer className="flex items-center gap-2 border-t border-line px-5 py-3.5">
              {action && onDelete ? (
                <button type="button" onClick={onDelete} className="v-btn v-btn-ghost !text-red-600">
                  <Icon name="trash" size={14} /> {t('links.delete')}
                </button>
              ) : null}
              <span className="flex-1" />
              <button type="button" onClick={onClose} className="v-btn v-btn-ghost">
                {t('settings.cancel')}
              </button>
              <button type="submit" disabled={busy} className="v-btn" data-testid="composer-submit">
                {busy ? <Icon name="loader" size={14} className="animate-spin" /> : <Icon name={action ? 'check' : 'plus'} size={14} />}
                {action ? t('composer.save') : t('composer.add')}
              </button>
            </footer>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Where on the card: a sketch of the round buttons under the name, or the list below. */
function PlacementSketch({ quick, color }: { quick: boolean; color: string }) {
  return (
    <span aria-hidden className="flex h-14 w-full flex-col gap-1 rounded-md bg-elevated p-1.5 ring-1 ring-inset ring-line">
      <span className="h-1.5 w-10 rounded-full bg-black/15 dark:bg-white/20" />
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-3.5 w-3.5 rounded-full" style={{ background: quick && i === 0 ? color : 'hsl(var(--v-border-strong))' }} />
        ))}
      </span>
      <span className="h-2.5 w-full rounded-sm" style={{ background: !quick ? color : 'hsl(var(--v-border))', opacity: !quick ? 1 : 0.8 }} />
      <span className="h-2.5 w-full rounded-sm" style={{ background: 'hsl(var(--v-border))' }} />
    </span>
  );
}
