import type { TFunction } from 'i18next';
import { authFetch, getActiveOrgId, setActiveOrgId } from '@/lib/client';
import { OPEN_LEAD_EVENT } from '@/lib/events';
import type { Locale } from '@/lib/i18n/config';

/** "Thu 1 Oct, 10:30" in the zone the meeting was booked in (or this device's). */
function meetingWhen(iso: string, timeZone: string, locale: Locale): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' };
  const tag = locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB';
  try {
    return new Intl.DateTimeFormat(tag, { ...opts, timeZone: timeZone || undefined }).format(at);
  } catch {
    return new Intl.DateTimeFormat(tag, opts).format(at);
  }
}

export interface Notif {
  id: string;
  type: string;
  category: string;
  priority: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  orgId?: string | null;
  actor: { name: string | null; email: string; avatarUrl?: string | null } | null;
}

/** Fired after a notification is read or archived, so the bell recounts. */
export const NOTIFS_CHANGED = 'vertex:notifications-changed';
export const announceChange = () => window.dispatchEvent(new Event(NOTIFS_CHANGED));

/** The categories the product actually sends, in the order people see them. */
export const CATEGORIES = ['CRM', 'ORGANIZATION', 'SECURITY', 'SYSTEM'] as const;

export const CATEGORY_ICON: Record<string, string> = {
  CRM: 'inbox',
  ORGANIZATION: 'users',
  SECURITY: 'shield',
  SYSTEM: 'sparkle',
  BILLING: 'chart-bar',
};

/** How loud the icon is: a failure or a change to your access stands out. */
export function toneOf(n: Notif): 'accent' | 'danger' | 'warning' | 'neutral' {
  if (n.type.endsWith('.failed')) return 'danger';
  if (n.type === 'member.suspended') return 'warning';
  if (n.type.startsWith('goal.')) return 'accent';
  if (n.category === 'CRM') return 'accent';
  return 'neutral';
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
/** Unicode isolates keep a name in the other script in its place. */
const iso = (v: string) => `\u2068${v}\u2069`;

/**
 * The title and body in the reader's language. The server stores English text
 * for every notification; for the types we know, the metadata is enough to say
 * it again properly. Anything else, and text people wrote themselves (an
 * automation's own message), is shown as stored.
 */
export function describe(n: Notif, t: TFunction, locale: Locale = 'en'): { title: string; body: string } {
  const m = n.metadata ?? {};
  const actor = n.actor?.name || n.actor?.email || '';
  const by = (key: string, values: Record<string, string> = {}) =>
    actor ? t(`notifications:types.${key}By`, { ...values, actor: iso(actor) }) : t(`notifications:types.${key}`, values);
  const role = (r: unknown) => (str(r) ? t(`teams:roles.${str(r)}.name`, { defaultValue: str(r) }) : '');
  const event = (e: unknown) => t(`integrations:events.${str(e)}`, { defaultValue: str(e) });

  switch (n.type) {
    case 'lead.captured': {
      const title = t(`notifications:types.lead.${str(m.intent) || 'CONTACT'}`, { defaultValue: n.title });
      // A meeting request says when, in the zone it was booked in.
      const when = str(m.meetingAt) ? meetingWhen(str(m.meetingAt), str(m.timezone), locale) : '';
      return { title, body: [n.body ?? '', when].filter(Boolean).join(' · ') };
    }
    case 'lead.follow_up': {
      const name = str(m.name);
      const hours = typeof m.waitingHours === 'number' ? m.waitingHours : 24;
      const days = Math.max(1, Math.round(hours / 24));
      return {
        title: name ? t('notifications:types.followUp', { name: iso(name) }) : t('notifications:types.followUpNoName'),
        body: [str(m.company), t('notifications:types.followUpBody', { count: days })].filter(Boolean).join(' · '),
      };
    }
    case 'automation.failed':
      return { title: t('notifications:types.automationFailed'), body: t('notifications:types.automationFailedBody', { event: event(m.event) }) };
    case 'webhook.failed':
      return { title: t('notifications:types.webhookFailed'), body: t('notifications:types.webhookFailedBody', { event: event(m.event) }) };
    case 'integration.failed': {
      const name = str(m.provider) === 'telegram' ? 'Telegram' : str(m.provider) === 'ms_teams' ? 'Microsoft Teams' : str(m.provider);
      return { title: t('notifications:types.integrationFailed', { name: iso(name) }), body: t('notifications:types.integrationFailedBody') };
    }
    case 'member.added':
      return { title: t('notifications:types.memberAdded'), body: role(m.role) ? t('notifications:types.memberAddedBody', { role: role(m.role) }) : '' };
    case 'member.role_changed':
      return { title: t('notifications:types.roleChanged'), body: role(m.role) ? t('notifications:types.roleChangedBody', { role: role(m.role) }) : '' };
    case 'member.suspended':
      return { title: t('notifications:types.suspended'), body: '' };
    case 'member.reactivated':
      return { title: t('notifications:types.reactivated'), body: '' };
    case 'member.removed':
      return { title: by('memberRemoved'), body: n.body ?? '' };
    case 'team.created':
      return { title: by('teamCreated', { name: iso(str(m.name)) }), body: '' };
    case 'team.deleted':
      return { title: by('teamDeleted', { name: iso(str(m.name)) }), body: '' };
    case 'org.branding_updated':
      return { title: by('workspaceUpdated'), body: '' };
    case 'goal.team_reached':
    case 'goal.you_reached':
    case 'goal.member_reached': {
      const metric = str(m.metric);
      const num = (v: unknown) => (typeof v === 'number' ? new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US').format(v) : '');
      const body = metric
        ? t('notifications:types.goalBody', {
            metric: t(`dashboard:goals.metric.${metric}`, { defaultValue: metric }),
            period: t(`dashboard:goals.period.${str(m.period) || 'WEEK'}`),
            value: num(m.value),
            target: num(m.target),
          })
        : n.body ?? '';
      const title =
        n.type === 'goal.team_reached'
          ? t('notifications:types.goalTeam')
          : n.type === 'goal.you_reached'
            ? t('notifications:types.goalYou')
            : t('notifications:types.goalMember', { name: iso(str(m.memberName)) });
      return { title, body };
    }
    case 'approval.approved':
      return { title: t('notifications:types.approved'), body: n.body ?? '' };
    case 'approval.rejected':
      return { title: t('notifications:types.rejected'), body: n.body ?? '' };
    default:
      return { title: n.title, body: n.body ?? '' };
  }
}

/** Where a notification leads, if anywhere. */
export function linkOf(n: Notif): string | null {
  const m = n.metadata ?? {};
  const data = (m.data ?? {}) as Record<string, unknown>;
  switch (n.type) {
    case 'lead.captured':
    case 'lead.follow_up':
      return str(m.leadId) ? `/leads?lead=${encodeURIComponent(str(m.leadId))}` : '/leads';
    case 'automation.triggered':
      return str(data.leadId) ? `/leads?lead=${encodeURIComponent(str(data.leadId))}` : '/integrations?tab=automations';
    case 'automation.failed':
      return '/integrations?tab=automations';
    case 'webhook.failed':
      return '/integrations?tab=webhooks';
    case 'integration.failed':
      return '/integrations';
    case 'team.created':
      return str(m.teamId) ? `/team?team=${encodeURIComponent(str(m.teamId))}` : '/team?view=teams';
    case 'team.deleted':
      return '/team?view=teams';
    case 'org.branding_updated':
      return '/workspace';
    case 'goal.team_reached':
    case 'goal.you_reached':
    case 'goal.member_reached':
      return '/dashboard';
    default:
      return n.type.startsWith('member.') ? '/team' : null;
  }
}

export function markRead(n: Notif, read = true) {
  return authFetch(`/notifications/${n.id}/${read ? 'read' : 'unread'}`, { method: 'PATCH' }).then(announceChange);
}

/**
 * Opens what a notification is about. One from another workspace switches to
 * it first, since the page it links to shows the active workspace only.
 */
export function openNotification(n: Notif, navigate: (href: string) => void) {
  if (!n.readAt) markRead(n).catch(() => {});
  const href = linkOf(n);
  if (!href) return;
  if (n.orgId && n.orgId !== getActiveOrgId()) {
    setActiveOrgId(n.orgId);
    window.location.href = href;
    return;
  }
  navigate(href);
  // The Leads page reads ?lead only when it mounts; if it is already open,
  // ask it directly.
  const lead = new URL(href, window.location.origin).searchParams.get('lead');
  if (lead) window.dispatchEvent(new CustomEvent(OPEN_LEAD_EVENT, { detail: lead }));
}

export type Bucket = 'today' | 'yesterday' | 'week' | 'earlier';
export function bucketOf(iso: string): Bucket {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = new Date(iso).getTime();
  if (t >= start) return 'today';
  if (t >= start - 86_400_000) return 'yesterday';
  if (t >= start - 6 * 86_400_000) return 'week';
  return 'earlier';
}
