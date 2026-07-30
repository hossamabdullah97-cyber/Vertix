/** Shared CRM types + presentation helpers (real data only — no fabricated fields). */

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
  createdAt: string;
  card: { slug: string } | null;
}

/** Compact money label ($42k, $1.2M) — deal value has no currency config yet, defaults to $. */
export function formatMoney(n: number): string {
  if (!n || n < 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
  return `$${n}`;
}
export function formatMoneyFull(n: number): string {
  return `$${(n || 0).toLocaleString()}`;
}

export interface Stage {
  id: string;
  name: string;
  order: number;
  color?: string | null;
}

export type ActivityType = 'NOTE' | 'CALL' | 'EMAIL' | 'MEETING' | 'STAGE_CHANGE' | 'SCORE_CHANGE' | 'SCAN';

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
    links.push({ key: 'whatsapp', icon: 'whatsapp', href: `https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`, label: 'WhatsApp', color: '#25d366' });
  }
  if (lead.email) {
    links.push({ key: 'email', icon: 'mail', href: `mailto:${lead.email}`, label: 'Email', color: '#ea4335' });
  }
  return links;
}
