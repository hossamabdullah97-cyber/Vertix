/** Shared CRM types + presentation helpers (real data only — no fabricated fields). */
import type { Locale } from '@/lib/i18n/config';

export interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  score: number;
  value: number; // estimated deal value (whole currency units)
  temperature: 'COLD' | 'WARM' | 'HOT';
  source: string;
  stageId: string | null;
  assignedTo?: string | null;
  /** When someone first / last reached out (a call, WhatsApp, email or meeting). */
  firstContactedAt?: string | null;
  lastContactedAt?: string | null;
  createdAt: string;
  card: { slug: string } | null;
}

const HOUR = 3_600_000;
/** A lead nobody reached for this long is flagged in the lists (the first reminder goes out then too). */
export const WAITING_FLAG_HOURS = 24;
/** Past this, a lead is old news rather than waiting (the reminders stop too). */
const WAITING_GIVE_UP_HOURS = 14 * 24;

/**
 * Hours a lead has been waiting for anyone to reach out, or null once someone
 * has (or when the list did not say, as an old cached copy might not).
 */
export function waitingHours(lead: Lead, now = Date.now()): number | null {
  if (lead.firstContactedAt !== null) return null;
  const h = Math.floor((now - new Date(lead.createdAt).getTime()) / HOUR);
  return h >= 0 ? h : 0;
}

/** Whether to flag a lead as waiting for a reply in the lists. */
export function awaitsReply(lead: Lead, now = Date.now()): boolean {
  const h = waitingHours(lead, now);
  return h !== null && h >= WAITING_FLAG_HOURS && h <= WAITING_GIVE_UP_HOURS;
}

/** "a day", "3 days", "5 hours": how long, for the waiting labels. */
export function waitingSpan(hours: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  return hours < 24 ? t('waiting.hours', { count: Math.max(1, hours) }) : t('waiting.days', { count: Math.floor(hours / 24) });
}

/** A wa.me link to the lead's number (Egyptian 01… understood), with a message ready. */
export function whatsappHref(phone: string, text?: string): string | null {
  let d = phone.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (/^01[0125]\d{8}$/.test(d)) d = `20${d.slice(1)}`;
  if (!/^[1-9]\d{7,14}$/.test(d)) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Deal values are in Egyptian pounds, the currency the product is sold in. */
const CURRENCY = 'EGP';
// The page's language is passed in rather than read from the document, so the
// server and the browser render the same text.
const moneyTag = (locale: Locale) => (locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US');

/** Compact money label: "EGP 42K", "‏42 ألف ج.م.‏". */
export function formatMoney(n: number, locale: Locale): string {
  return new Intl.NumberFormat(moneyTag(locale), { style: 'currency', currency: CURRENCY, notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(n > 0 ? n : 0);
}
export function formatMoneyFull(n: number, locale: Locale): string {
  return new Intl.NumberFormat(moneyTag(locale), { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(n || 0);
}
/** The currency beside a value field: "EGP" / "ج.م". */
export function currencyLabel(locale: Locale): string {
  return locale === 'ar' ? 'ج.م' : CURRENCY;
}

export interface Stage {
  id: string;
  name: string;
  order: number;
  color?: string | null;
}

/**
 * Translation key for a stage. The default pipeline's names (New, Contacted…)
 * have translations; a stage an org named itself falls back to its own name.
 */
export function stageKey(name: string): string {
  return `stages.${name.trim().toLowerCase()}`;
}

export type ActivityType = 'NOTE' | 'CALL' | 'EMAIL' | 'WHATSAPP' | 'MEETING' | 'STAGE_CHANGE' | 'SCORE_CHANGE' | 'SCAN';

export interface LeadActivity {
  id: string;
  type: ActivityType;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** A lead with its full activity history (from GET /leads/:id). */
export interface LeadDetail extends Lead {
  activities: LeadActivity[];
}

export const ACTIVITY_META: Record<ActivityType, { label: string; icon: string; color: string }> = {
  NOTE: { label: 'Note', icon: 'file-text', color: '#8b5cf6' },
  CALL: { label: 'Call', icon: 'phone', color: '#0ea5e9' },
  EMAIL: { label: 'Email', icon: 'mail', color: '#ea4335' },
  WHATSAPP: { label: 'WhatsApp', icon: 'whatsapp', color: '#25d366' },
  MEETING: { label: 'Meeting', icon: 'calendar', color: '#22c55e' },
  STAGE_CHANGE: { label: 'Stage changed', icon: 'chart-bar', color: '#6366f1' },
  SCORE_CHANGE: { label: 'Score changed', icon: 'sparkle', color: '#f59e0b' },
  SCAN: { label: 'Scan', icon: 'sparkle', color: '#14b8a6' },
};

/** The composer offers only these manual activity types. */
export const LOGGABLE: ActivityType[] = ['NOTE', 'CALL', 'EMAIL', 'MEETING'];

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
  leadId: string | null;
  createdAt: string;
  lead: { id: string; name: string | null } | null;
}

export const TASK_PRIORITY: Record<TaskPriority, { label: string; color: string }> = {
  HIGH: { label: 'High', color: '#ef4444' },
  MEDIUM: { label: 'Medium', color: '#f59e0b' },
  LOW: { label: 'Low', color: '#3b82f6' },
};

/** Due-date presentation: overdue / today / upcoming, with a friendly label. */
export function dueMeta(dueDate: string | null): { label: string; tone: 'overdue' | 'today' | 'upcoming' | 'none' } {
  if (!dueDate) return { label: 'No due date', tone: 'none' };
  const due = new Date(dueDate);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startDue = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const dayDiff = Math.round((startDue - startToday) / 86_400_000);
  if (dayDiff < 0) return { label: dayDiff === -1 ? 'Yesterday' : `${-dayDiff}d overdue`, tone: 'overdue' };
  if (dayDiff === 0) return { label: 'Today', tone: 'today' };
  if (dayDiff === 1) return { label: 'Tomorrow', tone: 'upcoming' };
  return { label: due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), tone: 'upcoming' };
}

export function isOverdue(t: Task): boolean {
  return !t.completed && !!t.dueDate && dueMeta(t.dueDate).tone === 'overdue';
}
export function isDueToday(t: Task): boolean {
  return !t.completed && !!t.dueDate && dueMeta(t.dueDate).tone === 'today';
}

/** Won / Lost stages resolved by name (fallbacks keep older pipelines working). */
export function wonStage(stages: Stage[]): Stage | undefined {
  return stages.find((s) => /won/i.test(s.name));
}
export function lostStage(stages: Stage[]): Stage | undefined {
  return stages.find((s) => /lost/i.test(s.name));
}

export type Temp = 'HOT' | 'WARM' | 'COLD';

export const TEMP_META: Record<Temp, { label: string; short: string; dot: string; fg: string; bg: string; border: string }> = {
  HOT: { label: 'Hot', short: 'Hot', dot: '#ef4444', fg: '#ef4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.20)' },
  WARM: { label: 'Warm', short: 'Warm', dot: '#f59e0b', fg: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)' },
  COLD: { label: 'Cold', short: 'Cold', dot: '#3b82f6', fg: '#3b82f6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.20)' },
};

/** Known lead sources → friendly label + icon. Falls back gracefully. */
export const SOURCE_META: Record<string, { label: string; icon: string }> = {
  card_form: { label: 'Card form', icon: 'grid' },
  nfc_scan: { label: 'NFC tap', icon: 'sparkle' },
  meeting: { label: 'Meeting request', icon: 'calendar' },
  quote: { label: 'Quote request', icon: 'quote' },
  share: { label: 'Shared link', icon: 'send' },
  view: { label: 'Profile view', icon: 'eye' },
  card_scan: { label: 'Paper card', icon: 'camera' },
  manual: { label: 'Added by hand', icon: 'user-plus' },
};

export function sourceMeta(source: string) {
  return SOURCE_META[source] ?? { label: source.replace(/_/g, ' '), icon: 'link' };
}

export function initials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/** Deterministic avatar hue from a string (stable across renders). */
export function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/**
 * The fill behind someone's initials. The hue comes from the name; the
 * lightness is the brightest that still keeps the white letters at 4.5:1, so
 * a yellow or green name is as readable as a blue one, in either theme.
 */
export function avatarColor(seed: string): string {
  const h = hueFor(seed);
  return `hsl(${h} 58% ${readableLightness(h)}%)`;
}

const lightnessByHue = new Map<number, number>();
function readableLightness(h: number): number {
  const cached = lightnessByHue.get(h);
  if (cached !== undefined) return cached;
  const channel = (n: number, l: number) => {
    const a = 0.58 * Math.min(l, 1 - l);
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  let l = 46;
  for (; l > 20; l--) {
    const lum = 0.2126 * channel(0, l / 100) + 0.7152 * channel(8, l / 100) + 0.0722 * channel(4, l / 100);
    if (1.05 / (lum + 0.05) >= 4.6) break;
  }
  lightnessByHue.set(h, l);
  return l;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const s = Math.round(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/** Quick-contact links built from whatever contact data the lead has. */
export function quickLinks(lead: Lead) {
  const links: { key: string; icon: string; href: string; label: string; color: string }[] = [];
  if (lead.phone) {
    links.push({ key: 'call', icon: 'phone', href: `tel:${lead.phone}`, label: 'Call', color: '#0ea5e9' });
    const wa = whatsappHref(lead.phone);
    if (wa) links.push({ key: 'whatsapp', icon: 'whatsapp', href: wa, label: 'WhatsApp', color: '#25d366' });
  }
  if (lead.email) {
    links.push({ key: 'email', icon: 'mail', href: `mailto:${lead.email}`, label: 'Email', color: '#ea4335' });
  }
  return links;
}
