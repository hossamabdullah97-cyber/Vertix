'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Icon } from '@/components/Icon';

/**
 * The events the product actually sends, grouped the way people think of them.
 * The API's catalogue also lists a few that nothing emits yet; they are left
 * out of the pickers so no one subscribes to silence.
 */
export const EVENT_GROUPS: { key: 'leads' | 'cards' | 'nfc' | 'team'; events: string[] }[] = [
  { key: 'leads', events: ['lead.created', 'lead.updated', 'meeting.requested', 'quote.requested'] },
  { key: 'cards', events: ['card.viewed', 'contact.saved'] },
  { key: 'nfc', events: ['nfc.tapped'] },
  { key: 'team', events: ['member.added'] },
];
export const LIVE_EVENTS = EVENT_GROUPS.flatMap((g) => g.events);

/** A readable name for an event key, or the key itself when it has none. */
export function eventLabel(t: TFunction, key: string): string {
  if (key === '*') return t('integrations:events.all');
  return t(`integrations:events.${key}`, { defaultValue: key });
}

/**
 * Wraps a value in Unicode isolates, the text form of <bdi>, so a name or date
 * in the other script keeps its place inside a translated sentence.
 */
export const iso = (v: string) => `\u2068${v}\u2069`;

export type Role = 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

/** What one tab asks another to open, e.g. an app pointing at a webhook. */
export type Handoff = { kind: 'webhook' } | { kind: 'automation'; template: string } | null;

export { Toggle } from '@/components/ui/Toggle';

/** A section heading with a short explanation and an optional action beside it. */
export function Intro({ text, action, docs }: { text: string; action?: React.ReactNode; docs?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-[620px] text-sm leading-relaxed text-muted">
        {text}
        {docs && (
          <>
            {' '}
            <a href={docs.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
              {docs.label}
              <Icon name="external-link" size={12} />
            </a>
          </>
        )}
      </p>
      {action}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: string; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl px-6 py-12 text-center ring-1 ring-inset ring-line">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-elevated text-muted">
        <Icon name={icon} size={18} />
      </span>
      <p className="mt-3 text-base font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-[380px] text-sm leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'neutral', icon, children, onDismiss }: { tone?: 'neutral' | 'success' | 'danger'; icon: string; children: React.ReactNode; onDismiss?: () => void }) {
  const { t } = useTranslation('integrations');
  const tones = {
    neutral: 'bg-elevated text-muted ring-line',
    success: 'bg-emerald-500/[0.07] text-emerald-800 ring-emerald-500/20 dark:text-emerald-300',
    danger: 'bg-red-500/[0.06] text-red-700 ring-red-500/20 dark:text-red-300',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`mb-4 flex items-start gap-3 rounded-lg px-4 py-3 text-sm leading-relaxed ring-1 ring-inset ${tones[tone]}`}>
      <Icon name={icon} size={15} className="mt-[3px] shrink-0" />
      <span className="min-w-0 flex-1 break-words">{children}</span>
      {onDismiss && (
        <button onClick={onDismiss} aria-label={t('dismiss')} className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/5">
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
}

/** A label above a control, as the sheets lay out their forms. */
export function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-faint">{hint}</p>}
    </div>
  );
}

/** Copies a value and says so for a moment. */
export function CopyButton({ value, className = '' }: { value: string; className?: string }) {
  const { t } = useTranslation('integrations');
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        })
      }
      className={`v-btn v-btn-ghost shrink-0 ${className}`}
    >
      <Icon name={copied ? 'check' : 'copy'} size={14} />
      {copied ? t('copied') : t('copy')}
    </button>
  );
}

/** A value shown for copying: monospace, left to right in either language. */
export function CopyField({ value }: { value: string }) {
  return (
    <div className="flex items-stretch gap-2">
      <code dir="ltr" className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-elevated px-3 py-2.5 font-mono text-xs text-ink ring-1 ring-inset ring-line">
        {value}
      </code>
      <CopyButton value={value} />
    </div>
  );
}

/**
 * Shows a secret that exists only this once (a new API key or signing
 * secret). It cannot be closed by a stray click, only by saying it was copied.
 */
export function SecretDialog({ open, title, value, children, onDone }: { open: boolean; title: string; value: string; children?: React.ReactNode; onDone: () => void }) {
  const { t } = useTranslation('integrations');
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) doneRef.current?.focus();
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="secret-title"
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="w-full max-w-[480px] rounded-xl border border-line bg-surface p-5 shadow-lg"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Icon name="lock" size={15} />
              </span>
              <h2 id="secret-title" className="text-md font-semibold text-ink">
                {title}
              </h2>
            </div>
            <p className="mt-2.5 text-sm leading-relaxed text-muted">{t('secretDialog.body')}</p>
            <div className="mt-4">
              <CopyField value={value} />
            </div>
            {children && <div className="mt-4">{children}</div>}
            <div className="mt-5 flex justify-end">
              <button ref={doneRef} onClick={onDone} className="v-btn">
                {t('secretDialog.done')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A small uppercase-free group label inside a sheet. */
export function SheetSection({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {hint && <p className="mt-1 text-xs leading-relaxed text-faint">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="v-card divide-y divide-line overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4">
          <div className="v-skeleton h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="v-skeleton h-3 w-1/3 rounded" />
            <div className="v-skeleton h-3 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
