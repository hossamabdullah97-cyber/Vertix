/**
 * What a card owner is told, by email and WhatsApp, when someone leaves
 * their details on one of their cards. Pure, so it can be tested as text.
 */

export type AlertLang = 'en' | 'ar';
export type LeadIntent = 'CONTACT' | 'MEETING' | 'QUOTE';

export interface LeadAlert {
  leadId: string;
  intent: LeadIntent;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  note?: string | null;
  /** ISO time of the meeting asked for. */
  meetingAt?: string | null;
  /** The card owner's time zone, for the meeting time. */
  timezone: string;
  /** The card's name, so owners with several cards know which one. */
  cardName: string;
  /** Where the lead opens in the app. */
  link: string;
  /** The card's own language: what the alert is written in until the owner picks one. */
  lang?: AlertLang;
}

const COPY = {
  en: {
    kind: { CONTACT: 'New contact', MEETING: 'Meeting request', QUOTE: 'Quote request' },
    subject: { CONTACT: '{name} shared their details', MEETING: '{name} asked to meet', QUOTE: '{name} asked for a quote' },
    via: 'From your card “{card}”',
    rows: { company: 'Company', email: 'Email', phone: 'Phone', meeting: 'Meeting', note: 'Message' },
    open: 'Open the lead',
    answer: 'Accept or decline',
    whatsapp: 'Reply on WhatsApp',
    greeting: 'Hi {name}, this is {card}. Thanks for getting in touch!',
    footer: 'You get this because email alerts for new leads are on. You can turn them off in Notifications › Settings.',
  },
  ar: {
    kind: { CONTACT: 'جهة اتصال جديدة', MEETING: 'طلب اجتماع', QUOTE: 'طلب عرض سعر' },
    subject: { CONTACT: '{name} شارك بياناته', MEETING: '{name} يطلب اجتماعاً', QUOTE: '{name} يطلب عرض سعر' },
    via: 'من بطاقتك «{card}»',
    rows: { company: 'الشركة', email: 'البريد', phone: 'الهاتف', meeting: 'الاجتماع', note: 'الرسالة' },
    open: 'افتح العميل',
    answer: 'اقبل أو ارفض الاجتماع',
    whatsapp: 'رد على واتساب',
    greeting: 'أهلاً {name}، معك {card}. شكراً لتواصلك!',
    footer: 'وصلك هذا لأن تنبيهات البريد للعملاء الجدد مفعلة. يمكنك إيقافها من الإشعارات › الإعدادات.',
  },
} as const;

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '');
/** Keeps a name in another script from reordering the sentence around it. */
const isolate = (s: string) => `\u2068${s}\u2069`;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * A WhatsApp number in the form the API takes: digits, country code first.
 * Egyptian numbers typed the local way (010…) are understood. Null when it
 * cannot be a phone number.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  let d = (input ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (/^01[0125]\d{8}$/.test(d)) d = `20${d.slice(1)}`;
  if (d.includes('+')) return null;
  return /^[1-9]\d{7,14}$/.test(d) ? d : null;
}

/** Arabic with the same digits the app shows (10:30, not ١٠:٣٠). */
const tagOf = (lang: AlertLang) => (lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB');

export function meetingTime(iso: string, timezone: string, lang: AlertLang): string {
  const at = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: timezone };
  try {
    return new Intl.DateTimeFormat(tagOf(lang), opts).format(at);
  } catch {
    return new Intl.DateTimeFormat(tagOf(lang), { ...opts, timeZone: 'UTC' }).format(at) + ' UTC';
  }
}

function rowsOf(a: LeadAlert, lang: AlertLang): [string, string][] {
  const c = COPY[lang].rows;
  const rows: [string, string | null | undefined][] = [
    [c.meeting, a.meetingAt ? meetingTime(a.meetingAt, a.timezone, lang) : null],
    [c.company, a.company],
    [c.phone, a.phone],
    [c.email, a.email],
    [c.note, a.note],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]?.trim()).map(([k, v]) => [k, v.trim()]);
}

export function alertEmail(a: LeadAlert, lang: AlertLang): { subject: string; html: string } {
  const c = COPY[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const subject = fill(c.subject[a.intent], { name: a.name });
  const wa = normalizePhone(a.phone);
  // A phone number and an address are one tap from calling or writing back.
  const linked = (k: string, v: string) => {
    const href = k === c.rows.phone ? `tel:${v.replace(/[^\d+]/g, '')}` : k === c.rows.email ? `mailto:${v}` : null;
    return href ? `<a href="${escapeHtml(href)}" style="color:#2563eb;text-decoration:none" dir="ltr">${escapeHtml(v)}</a>` : escapeHtml(v);
  };
  const rows = rowsOf(a, lang)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;color:#71717a;font-size:13px;vertical-align:top;width:96px">${escapeHtml(k)}</td>` +
        `<td style="padding:8px 0;color:#18181b;font-size:14px;white-space:pre-wrap">${linked(k, v)}</td></tr>`,
    )
    .join('');
  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 0 8px;${primary ? 'background:#18181b;color:#fff' : 'background:#fff;color:#18181b;border:1px solid #e4e4e7'};text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600;font-size:14px">${escapeHtml(label)}</a>`;
  const html = `<div dir="${dir}" style="font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;max-width:520px;margin:auto;padding:24px;text-align:${lang === 'ar' ? 'right' : 'left'}">
  <p style="margin:0 0 6px;color:#71717a;font-size:12px;letter-spacing:.04em;text-transform:uppercase">${escapeHtml(c.kind[a.intent])}</p>
  <h1 style="margin:0 0 4px;color:#18181b;font-size:22px">${escapeHtml(a.name)}</h1>
  <p style="margin:0 0 16px;color:#71717a;font-size:13px">${escapeHtml(fill(c.via, { card: isolate(a.cardName) }))}</p>
  <table style="width:100%;border-collapse:collapse;border-top:1px solid #f4f4f5;margin-bottom:20px">${rows}</table>
  ${button(a.link, a.intent === 'MEETING' ? c.answer : c.open, true)} ${wa ? button(`https://wa.me/${wa}?text=${encodeURIComponent(fill(c.greeting, { name: a.name, card: a.cardName }))}`, c.whatsapp, false) : ''}
  <p style="margin:24px 0 0;color:#a1a1aa;font-size:12px;line-height:1.5">${escapeHtml(c.footer)}</p>
</div>`;
  return { subject, html };
}

/** WhatsApp takes no line breaks, tabs or long runs of spaces in a parameter. */
const waText = (s: string, max = 300) => {
  const t = s.replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/**
 * The three body parameters of the `new_lead` template: what it is, who, and
 * the details (meeting time, company, phone). The lead's page is the
 * template's button, whose address ends with the lead id.
 */
export function alertWhatsApp(a: LeadAlert, lang: AlertLang): string[] {
  const c = COPY[lang];
  const details = rowsOf(a, lang)
    .filter(([k]) => k !== c.rows.note && k !== c.rows.email)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
  return [waText(c.kind[a.intent]), waText(a.name, 100), waText(details || fill(c.via, { card: isolate(a.cardName) }))];
}
