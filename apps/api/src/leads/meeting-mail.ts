import { escapeHtml, type AlertLang } from '../notifications/lead-alert';

/**
 * What the visitor is told once the card's owner answers their meeting
 * request: a confirmation with the invite, or a polite no with a way to
 * pick another time. Written in the card's language, since that is the
 * language the visitor used.
 */

export interface MeetingReply {
  decision: 'ACCEPTED' | 'DECLINED';
  visitorName: string;
  ownerName: string;
  /** "Sales Director · Vertex Build", when known. */
  ownerLine?: string | null;
  meetingAt: Date;
  minutes: number;
  timezone: string;
  message?: string | null;
  cardUrl: string;
  calendarUrl?: string;
}

const COPY = {
  en: {
    subject: { ACCEPTED: 'Your meeting with {owner} is confirmed', DECLINED: 'About your meeting request with {owner}' },
    hello: 'Hi {name},',
    accepted: '{owner} confirmed your meeting.',
    declined: '{owner} can’t make the time you asked for.',
    when: 'When',
    length: '{n} minutes',
    fromOwner: 'Message from {owner}',
    invite: 'The calendar invite is attached to this email.',
    addGoogle: 'Add to Google Calendar',
    viewCard: 'View {owner}’s card',
    pickAnother: 'Choose another time',
  },
  ar: {
    subject: { ACCEPTED: 'تم تأكيد اجتماعك مع {owner}', DECLINED: 'بخصوص طلب اجتماعك مع {owner}' },
    hello: 'مرحباً {name}،',
    accepted: 'أكد {owner} موعد اجتماعكما.',
    declined: 'لا يستطيع {owner} الحضور في الموعد الذي طلبته.',
    when: 'الموعد',
    length: '{n} دقيقة',
    fromOwner: 'رسالة من {owner}',
    invite: 'دعوة التقويم مرفقة بهذا البريد.',
    addGoogle: 'أضفه إلى تقويم Google',
    viewCard: 'بطاقة {owner}',
    pickAnother: 'اختر موعداً آخر',
  },
} as const;

/** Keeps a name in another script from reordering the sentence around it. */
const isolate = (s: string) => `⁨${s}⁩`;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '');

/** "Thursday, 1 October, 12:00 (GMT+3)" in the card's time zone. */
export function meetingWhen(at: Date, timezone: string, lang: AlertLang): string {
  const locale = lang === 'ar' ? 'ar-EG' : 'en-GB';
  let zone = timezone;
  try {
    new Intl.DateTimeFormat(locale, { timeZone: timezone });
  } catch {
    zone = 'UTC';
  }
  const day = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: zone }).format(at);
  const tz = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value;
  return tz ? `${day} (⁦${tz}⁩)` : day;
}

export function meetingReplyEmail(r: MeetingReply, lang: AlertLang): { subject: string; html: string } {
  const c = COPY[lang];
  const owner = isolate(r.ownerName);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const align = lang === 'ar' ? 'right' : 'left';
  const accepted = r.decision === 'ACCEPTED';
  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 0 8px;${primary ? 'background:#18181b;color:#fff' : 'background:#fff;color:#18181b;border:1px solid #e4e4e7'};text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600;font-size:14px">${escapeHtml(label)}</a>`;
  const message = r.message?.trim()
    ? `<div style="margin:0 0 20px;padding:14px 16px;background:#f4f4f5;border-radius:10px">
    <p style="margin:0 0 4px;color:#71717a;font-size:12px">${escapeHtml(fill(c.fromOwner, { owner }))}</p>
    <p style="margin:0;color:#18181b;font-size:14px;line-height:1.55;white-space:pre-wrap">${escapeHtml(r.message.trim())}</p>
  </div>`
    : '';
  const buttons = accepted
    ? [r.calendarUrl ? button(r.calendarUrl, c.addGoogle, true) : '', button(r.cardUrl, fill(c.viewCard, { owner }), !r.calendarUrl)].join(' ')
    : button(r.cardUrl, c.pickAnother, true);
  const html = `<div dir="${dir}" style="font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;max-width:520px;margin:auto;padding:24px;text-align:${align}">
  <p style="margin:0 0 12px;color:#18181b;font-size:15px">${escapeHtml(fill(c.hello, { name: isolate(r.visitorName) }))}</p>
  <p style="margin:0 0 18px;color:#18181b;font-size:15px;line-height:1.55">${escapeHtml(fill(accepted ? c.accepted : c.declined, { owner }))}</p>
  <table style="width:100%;border-collapse:collapse;border-top:1px solid #f4f4f5;margin-bottom:18px">
    <tr><td style="padding:10px 0;color:#71717a;font-size:13px;width:96px;vertical-align:top">${escapeHtml(c.when)}</td>
    <td style="padding:10px 0;color:#18181b;font-size:14px;${accepted ? '' : 'text-decoration:line-through;color:#71717a'}">${escapeHtml(meetingWhen(r.meetingAt, r.timezone, lang))}<br><span style="color:#71717a;font-size:13px">${escapeHtml(fill(c.length, { n: String(r.minutes) }))}</span></td></tr>
    <tr><td style="padding:10px 0;color:#71717a;font-size:13px;vertical-align:top">${lang === 'ar' ? 'مع' : 'With'}</td>
    <td style="padding:10px 0;color:#18181b;font-size:14px">${escapeHtml(r.ownerName)}${r.ownerLine ? `<br><span style="color:#71717a;font-size:13px">${escapeHtml(r.ownerLine)}</span>` : ''}</td></tr>
  </table>
  ${message}
  ${buttons}
  ${accepted ? `<p style="margin:16px 0 0;color:#a1a1aa;font-size:12px">${escapeHtml(c.invite)}</p>` : ''}
</div>`;
  return { subject: fill(c.subject[r.decision], { owner: r.ownerName }), html };
}
