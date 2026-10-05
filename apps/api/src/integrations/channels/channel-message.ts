import { workspaceLink } from '../../common/workspace-link';
/**
 * What a Telegram chat or a Teams channel is told when something happens in a
 * workspace: a title, a few labelled facts and a link to open it in the app,
 * in the language the connection was set up with. Pure, so the wording can be
 * tested without sending anything.
 */

export type ChannelLang = 'en' | 'ar';

/** The events a channel can be told about, in the order the settings list them. */
export const CHANNEL_EVENTS = ['lead.created', 'meeting.requested', 'quote.requested', 'contact.saved', 'nfc.tapped', 'member.added'] as const;
export type ChannelEvent = (typeof CHANNEL_EVENTS)[number];
export const DEFAULT_CHANNEL_EVENTS: ChannelEvent[] = ['lead.created'];

export interface ChannelMessage {
  title: string;
  facts: { label: string; value: string }[];
  link?: { label: string; url: string };
}

const TEXT = {
  en: {
    lead: { CONTACT: 'New lead', MEETING: 'New meeting request', QUOTE: 'New quote request' } as Record<string, string>,
    contactSaved: 'Someone saved a card’s contact',
    nfcTapped: 'A chip was tapped',
    memberAdded: 'A new member joined',
    test: 'Vertex Connect is connected',
    testBody: 'New leads from your cards will show up here.',
    name: 'Name',
    phone: 'Phone',
    email: 'Email',
    company: 'Company',
    card: 'Card',
    when: 'Asked for',
    chip: 'Chip',
    role: 'Role',
    open: 'Open in Vertex Connect',
  },
  ar: {
    lead: { CONTACT: 'عميل جديد', MEETING: 'طلب اجتماع جديد', QUOTE: 'طلب عرض سعر جديد' } as Record<string, string>,
    contactSaved: 'حفظ أحدهم جهة اتصال من بطاقة',
    nfcTapped: 'لمس أحدهم شريحة',
    memberAdded: 'انضم عضو جديد',
    test: 'تم ربط Vertex Connect',
    testBody: 'سيظهر هنا العملاء الجدد من بطاقاتكم.',
    name: 'الاسم',
    phone: 'الهاتف',
    email: 'البريد',
    company: 'الشركة',
    card: 'البطاقة',
    when: 'الموعد المطلوب',
    chip: 'الشريحة',
    role: 'الدور',
    open: 'فتح في Vertex Connect',
  },
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');

/**
 * Whether a channel subscribed to `events` should be told about `event`. A
 * meeting or quote request also arrives as a new lead, and that message
 * already says which it is, so one subscribed to both hears it once.
 */
export function wants(events: readonly string[], event: string): boolean {
  if (!events.includes(event)) return false;
  if ((event === 'meeting.requested' || event === 'quote.requested') && events.includes('lead.created')) return false;
  return true;
}

/** A meeting time as people there read it, in the zone it was booked in. */
function when(iso: string, lang: ChannelLang, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(d);
}

/** The message for one event, or null for one a channel is never told about. */
export function channelMessage(
  event: string,
  data: Record<string, unknown>,
  opts: { lang: ChannelLang; appUrl: string; timeZone: string; workspace?: string | null },
): ChannelMessage | null {
  const t = TEXT[opts.lang];
  const app = opts.appUrl.replace(/\/$/, '');
  const fact = (label: string, value: string) => (value ? [{ label, value }] : []);
  const card = str(data.cardSlug) || str(data.slug);
  const leadLink = str(data.leadId) ? { label: t.open, url: app + workspaceLink(`/leads?lead=${encodeURIComponent(str(data.leadId))}`, opts.workspace) } : undefined;

  switch (event) {
    case 'lead.created':
    case 'meeting.requested':
    case 'quote.requested': {
      const intent = event === 'meeting.requested' ? 'MEETING' : event === 'quote.requested' ? 'QUOTE' : str(data.intent) || 'CONTACT';
      return {
        title: t.lead[intent] ?? t.lead.CONTACT,
        facts: [
          ...fact(t.name, str(data.name)),
          ...fact(t.phone, str(data.phone)),
          ...fact(t.email, str(data.email)),
          ...fact(t.company, str(data.company)),
          ...fact(t.when, str(data.meetingAt) ? when(str(data.meetingAt), opts.lang, opts.timeZone) : ''),
          ...fact(t.card, card ? `/c/${card}` : ''),
        ],
        link: leadLink,
      };
    }
    case 'contact.saved':
      return { title: t.contactSaved, facts: fact(t.card, card ? `/c/${card}` : '') };
    case 'nfc.tapped':
      return { title: t.nfcTapped, facts: [...fact(t.chip, str(data.tagUid)), ...fact(t.card, card ? `/c/${card}` : '')] };
    case 'member.added':
      return { title: t.memberAdded, facts: [...fact(t.email, str(data.email)), ...fact(t.role, str(data.role))] };
    default:
      return null;
  }
}

/** The message sent when a channel is connected or tested. */
export function testMessage(lang: ChannelLang, appUrl: string): ChannelMessage {
  const t = TEXT[lang];
  return { title: t.test, facts: [{ label: '', value: t.testBody }], link: { label: t.open, url: `${appUrl.replace(/\/$/, '')}/leads` } };
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A Telegram sendMessage body (HTML parse mode: only &, < and > need escaping). */
export function telegramBody(chatId: string, m: ChannelMessage): Record<string, unknown> {
  const lines = [
    `<b>${escapeHtml(m.title)}</b>`,
    ...m.facts.map((f) => (f.label ? `${escapeHtml(f.label)}: ${escapeHtml(f.value)}` : escapeHtml(f.value))),
  ];
  return {
    chat_id: chatId,
    text: lines.join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(m.link ? { reply_markup: { inline_keyboard: [[{ text: m.link.label, url: m.link.url }]] } } : {}),
  };
}

/**
 * A Teams message: an Adaptive Card in the envelope both a Workflows webhook
 * ("When a Teams webhook request is received") and an older incoming webhook take.
 */
export function teamsBody(m: ChannelMessage, lang: ChannelLang): Record<string, unknown> {
  const rtl = lang === 'ar';
  const facts = m.facts.filter((f) => f.label);
  const notes = m.facts.filter((f) => !f.label);
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          ...(rtl ? { rtl: true } : {}),
          body: [
            { type: 'TextBlock', text: m.title, weight: 'Bolder', size: 'Medium', wrap: true },
            ...notes.map((f) => ({ type: 'TextBlock', text: f.value, wrap: true })),
            ...(facts.length ? [{ type: 'FactSet', facts: facts.map((f) => ({ title: f.label, value: f.value })) }] : []),
          ],
          ...(m.link ? { actions: [{ type: 'Action.OpenUrl', title: m.link.label, url: m.link.url }] } : {}),
        },
      },
    ],
  };
}
