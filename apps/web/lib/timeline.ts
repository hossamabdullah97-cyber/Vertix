import type { ActivityType, LeadActivity, Task } from '@/lib/crm';

/** One visit to a card: opened (by a link or a chip tap) and what they did there. */
export interface VisitItem {
  kind: 'visit';
  id: string;
  at: string;
  endedAt: string;
  card: { id: string; name: string } | null;
  /** After they had left their details: they came back. */
  returning: boolean;
  tapped: boolean;
  actions: { type: 'CLICK' | 'SAVE' | 'SHARE'; at: string; action?: string; platform?: string }[];
}

export interface CreatedItem {
  kind: 'created';
  id: string;
  at: string;
  source: string | null;
  card: { id: string; name: string } | null;
  tag: string | null;
}

export interface ServerActivityItem {
  kind: 'activity';
  id: string;
  at: string;
  type: ActivityType;
  metadata: Record<string, unknown> | null;
  author: LeadActivity['author'];
}

export interface TimelineSummary {
  visits: number;
  returns: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  contacts: number;
  lastContactAt: string | null;
  notes: number;
  openTasks: number;
  overdueTasks: number;
}

export interface TimelineResponse {
  items: (VisitItem | CreatedItem | ServerActivityItem | { kind: 'task'; id: string; at: string })[];
  summary: TimelineSummary;
}

/** What the drawer shows: the server's visits and creation, with activity and tasks as they are now. */
export type Entry =
  | VisitItem
  | CreatedItem
  | { kind: 'activity'; id: string; at: string; activity: LeadActivity }
  | { kind: 'task'; id: string; at: string; event: 'created' | 'completed'; task: Task };

export type TimelineFilter = 'all' | 'conversations' | 'notes' | 'visits' | 'tasks' | 'changes';
export const TIMELINE_FILTERS: TimelineFilter[] = ['all', 'conversations', 'notes', 'visits', 'tasks', 'changes'];

const CONVERSATIONS = new Set<ActivityType>(['CALL', 'EMAIL', 'WHATSAPP', 'MEETING']);

export function activitiesOf(r: TimelineResponse): LeadActivity[] {
  return r.items
    .filter((i): i is ServerActivityItem => i.kind === 'activity')
    .map((i) => ({ id: i.id, type: i.type, metadata: i.metadata, createdAt: i.at, author: i.author }));
}

/** The note a card's form leaves when nothing was written in it. */
export function isBareCapture(a: LeadActivity): boolean {
  const m = a.metadata ?? {};
  return a.type === 'NOTE' && m.manual !== true && !m.by && !(typeof m.note === 'string' && m.note.trim());
}

/** The lead's whole story, newest first, from the parts the drawer keeps current. */
export function entries(fixed: (VisitItem | CreatedItem)[], activities: LeadActivity[], tasks: Task[]): Entry[] {
  const list: Entry[] = [
    ...fixed,
    // The empty note a sent form leaves says only what the creation already says.
    ...activities.filter((a) => !isBareCapture(a)).map((a) => ({ kind: 'activity' as const, id: a.id, at: a.createdAt, activity: a })),
    ...tasks.flatMap((task) => {
      const out: Entry[] = [{ kind: 'task', id: `task-${task.id}`, at: task.createdAt, event: 'created', task }];
      if (task.completed && task.completedAt) out.push({ kind: 'task', id: `task-done-${task.id}`, at: task.completedAt, event: 'completed', task });
      return out;
    }),
  ];
  // Newest first; at the same moment the lead's creation reads last.
  return list.sort((a, b) => b.at.localeCompare(a.at) || (a.kind === 'created' ? 1 : b.kind === 'created' ? -1 : 0));
}

export function matches(e: Entry, f: TimelineFilter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'conversations':
      return e.kind === 'activity' && CONVERSATIONS.has(e.activity.type);
    case 'notes':
      return e.kind === 'activity' && e.activity.type === 'NOTE';
    case 'visits':
      return e.kind === 'visit';
    case 'tasks':
      return e.kind === 'task';
    case 'changes':
      return e.kind === 'created' || (e.kind === 'activity' && !CONVERSATIONS.has(e.activity.type) && e.activity.type !== 'NOTE');
  }
}

/** Entries grouped by the reader's calendar day, in order. */
export function byDay<T extends { at: string }>(list: T[], timeZone?: string): { day: string; items: T[] }[] {
  const key = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  const out: { day: string; items: T[] }[] = [];
  for (const item of list) {
    const day = key(item.at);
    const last = out[out.length - 1];
    if (last && last.day === day) last.items.push(item);
    else out.push({ day, items: [item] });
  }
  return out;
}

/** The translation key for something done during a visit. */
export function visitActionKey(a: VisitItem['actions'][number]): string {
  if (a.type === 'SAVE') return 'timeline.did.save';
  if (a.type === 'SHARE') return 'timeline.did.share';
  if (a.platform) return 'timeline.did.payment';
  switch (a.action) {
    case 'WHATSAPP':
    case 'LINKEDIN':
    case 'CALL':
    case 'EMAIL':
    case 'MAPS':
    case 'WEBSITE':
    case 'FILE':
    case 'BOOK_MEETING':
    case 'REQUEST_QUOTE':
    case 'SAVE_CONTACT':
      return `timeline.did.${a.action}`;
    default:
      return 'timeline.did.link';
  }
}

/** Minutes spent on a visit, when it was more than a glance. */
export function visitMinutes(v: VisitItem): number {
  return Math.round((new Date(v.endedAt).getTime() - new Date(v.at).getTime()) / 60_000);
}
