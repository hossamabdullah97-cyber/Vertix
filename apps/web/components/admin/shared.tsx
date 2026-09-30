'use client';

import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';

export type Plan = 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
export const PLANS: Plan[] = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'];

export interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  isActive: boolean;
  createdAt: string;
  owner: { id: string; name: string | null; email: string } | null;
  membersCount: number;
  cardsCount: number;
  nfcCount: number;
  leadsCount: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  isSuperAdmin: boolean;
  organizations: { id: string; name: string; role: string; status: string }[];
  cardsCount: number;
  leadsCount: number;
}

/** The label above a control in the console's sheets. */
export function Field({ label, hint, htmlFor, children }: { label: string; hint?: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
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

export function Notice({ tone = 'neutral', children, onDismiss }: { tone?: 'neutral' | 'success' | 'danger'; children: React.ReactNode; onDismiss?: () => void }) {
  const { t } = useTranslation('admin');
  const tones = {
    neutral: 'bg-elevated text-muted ring-line',
    success: 'bg-emerald-500/[0.07] text-emerald-800 ring-emerald-500/20 dark:text-emerald-300',
    danger: 'bg-red-500/[0.06] text-red-700 ring-red-500/20 dark:text-red-300',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`mb-4 flex items-start gap-3 rounded-lg px-4 py-3 text-sm leading-relaxed ring-1 ring-inset ${tones[tone]}`}>
      <Icon name={tone === 'success' ? 'check' : tone === 'danger' ? 'alert' : 'info'} size={15} className="mt-[3px] shrink-0" />
      <span className="min-w-0 flex-1 break-words">{children}</span>
      {onDismiss && (
        <button onClick={onDismiss} aria-label={t('close')} className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/5">
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
}

/** A search box with its icon, the same one the rest of the app uses. */
export function SearchField({ value, onChange, placeholder, className = '' }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">{placeholder}</span>
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-faint">
        <Icon name="search" size={14} />
      </span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="v-field w-full !ps-9" />
    </label>
  );
}

/** Round filter chips; one is on at a time. */
export function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 md:mx-0 md:px-0">
      {options.map((o) => (
        <button
          key={o.key}
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={`h-11 shrink-0 rounded-full px-3.5 text-sm font-medium transition-colors sm:h-8 ${value === o.key ? 'bg-ink text-canvas' : 'text-muted ring-1 ring-inset ring-line hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A random password an admin can hand over, readable and hard to guess. */
export function generatePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/** A password field shown in the clear, with a button that fills in a strong one. */
export function PasswordField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation('admin');
  return (
    <div className="flex gap-2">
      <input id={id} dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" spellCheck={false} className="v-field min-w-0 flex-1 font-mono text-sm rtl:text-right" />
      <button type="button" onClick={() => onChange(generatePassword())} className="v-btn v-btn-ghost shrink-0">
        <Icon name="refresh" size={14} /> {t('workspaces.form.generate')}
      </button>
    </div>
  );
}

export const PLAN_BADGE: Record<string, string> = {
  FREE: 'v-badge-neutral',
  PRO: 'v-badge-accent',
  BUSINESS: 'v-badge-accent',
  ENTERPRISE: 'v-badge-success',
};
