import { workspaceLink } from '../common/workspace-link';
/**
 * The Sunday-morning email about a workspace's week: what it adds up to,
 * against the week before, and what is waiting on someone. Pure, so it can be
 * read and tested without a database or a mail provider.
 */

export type ReportLang = 'en' | 'ar';

export interface WeeklyReport {
  orgName: string;
  from: Date;
  to: Date;
  /** [this week, the week before] */
  taps: [number, number];
  reached: [number, number];
  leads: [number, number];
  meetings: [number, number];
  won: { count: number; value: number };
  /** Of this week's leads, how many someone has reached out to, and how fast (median hours). */
  contacted: number;
  medianReplyHours: number | null;
  waiting: { total: number; top: { id: string; name: string | null; company: string | null; hours: number }[] };
  members: { name: string; leads: number; scans: number }[];
  topChip: { label: string; scans: number } | null;
}

/** Whether a week had anything worth an email. */
export function isQuietWeek(r: WeeklyReport): boolean {
  return r.taps[0] + r.reached[0] + r.leads[0] + r.meetings[0] + r.won.count + r.waiting.total === 0;
}

const T = {
  en: {
    subject: (n: number) => (n === 1 ? 'Your week on Vertex Connect: 1 new lead' : `Your week on Vertex Connect: ${n} new leads`),
    quietSubject: 'Your week on Vertex Connect',
    weekOf: 'Your week',
    taps: 'Chip taps',
    reached: 'People reached',
    leads: 'New leads',
    meetings: 'Meeting requests',
    vsLast: 'vs last week',
    same: 'same as last week',
    response: 'Replying',
    responseLine: (c: number, n: number) =>
      c === 0
        ? `Nobody has reached out to ${n === 1 ? "this week's new lead" : `this week's ${n} new leads`} yet.`
        : `Your team reached out to ${c} of ${n} new ${n === 1 ? 'lead' : 'leads'}.`,
    medianLine: (h: string) => `Half of them heard back within ${h}.`,
    hours: (h: number) => (h < 1 ? 'an hour' : h < 24 ? `${Math.round(h)} ${Math.round(h) === 1 ? 'hour' : 'hours'}` : `${Math.round(h / 24)} ${Math.round(h / 24) === 1 ? 'day' : 'days'}`),
    waitingTitle: (n: number) => (n === 1 ? '1 lead is waiting for a reply' : `${n} leads are waiting for a reply`),
    waitingFor: (h: string) => `waiting ${h}`,
    reply: 'Reply',
    andMore: (n: number) => `and ${n} more`,
    won: (n: number, v: string) => `${n} ${n === 1 ? 'deal' : 'deals'} won${v ? `, worth ${v}` : ''}.`,
    team: 'Top of the team',
    teamLine: (l: number, s: number) => `${l} ${l === 1 ? 'lead' : 'leads'} · ${s} ${s === 1 ? 'tap' : 'taps'}`,
    chip: (label: string, n: number) => `Busiest chip: ${label}, tapped ${n} ${n === 1 ? 'time' : 'times'}.`,
    open: 'Open your dashboard',
    unknown: 'Unnamed lead',
    footer: (org: string) => `You get this every Sunday morning about ${org}.`,
    turnOff: 'Turn it off',
    quiet: 'A quiet week: no taps, visits or new leads. Hand out a few cards this week and the next report will have more to say.',
  },
  ar: {
    subject: (n: number) => `أسبوعك على Vertex Connect: ${n === 1 ? 'عميل جديد' : n === 2 ? 'عميلان جديدان' : n <= 10 ? `${n} عملاء جدد` : `${n} عميلاً جديداً`}`,
    quietSubject: 'أسبوعك على Vertex Connect',
    weekOf: 'أسبوعك',
    taps: 'لمسات الشرائح',
    reached: 'أشخاص وصلت إليهم',
    leads: 'عملاء جدد',
    meetings: 'طلبات اجتماع',
    vsLast: 'مقارنة بالأسبوع الماضي',
    same: 'مثل الأسبوع الماضي',
    response: 'الرد على العملاء',
    responseLine: (c: number, n: number) =>
      c === 0
        ? `لم يتواصل فريقك بعد مع ${n === 1 ? 'عميل هذا الأسبوع الجديد' : `أيٍّ من عملاء هذا الأسبوع الجدد (${n})`}.`
        : `تواصل فريقك مع ${c} من ${n} ${n <= 10 && n > 2 ? 'عملاء جدد' : 'عميلاً جديداً'}.`,
    medianLine: (h: string) => `نصفهم وصلهم الرد خلال ${h}.`,
    hours: (h: number) => {
      if (h < 1) return 'ساعة';
      if (h < 24) {
        const n = Math.round(h);
        return n === 1 ? 'ساعة' : n === 2 ? 'ساعتين' : n <= 10 ? `${n} ساعات` : `${n} ساعة`;
      }
      const d = Math.round(h / 24);
      return d === 1 ? 'يوم' : d === 2 ? 'يومين' : d <= 10 ? `${d} أيام` : `${d} يوماً`;
    },
    waitingTitle: (n: number) => (n === 1 ? 'عميل ينتظر ردك' : n === 2 ? 'عميلان ينتظران ردك' : `${n} عملاء ينتظرون ردك`),
    waitingFor: (h: string) => `ينتظر منذ ${h}`,
    reply: 'رُد الآن',
    andMore: (n: number) => `و${n} غيرهم`,
    won: (n: number, v: string) => `${n === 1 ? 'صفقة واحدة' : n === 2 ? 'صفقتان' : `${n} صفقات`} تمّت${v ? ` بقيمة ${v}` : ''}.`,
    team: 'الأبرز في الفريق',
    teamLine: (l: number, s: number) => `${l} عملاء · ${s} لمسة`,
    chip: (label: string, n: number) => `الشريحة الأكثر استخداماً: ${label}، لُمست ${n} مرة.`,
    open: 'افتح لوحة التحكم',
    unknown: 'عميل بلا اسم',
    footer: (org: string) => `تصلك هذه الرسالة صباح كل أحد عن ${org}.`,
    turnOff: 'إيقافها',
    quiet: 'أسبوع هادئ: لا لمسات ولا زيارات ولا عملاء جدد. وزّع بعض البطاقات هذا الأسبوع وسيكون للتقرير القادم ما يقوله.',
  },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function weeklyReportSubject(r: WeeklyReport, lang: ReportLang): string {
  return isQuietWeek(r) || !r.leads[0] ? T[lang].quietSubject : T[lang].subject(r.leads[0]);
}

/** The email, as HTML that holds up in mail apps: tables and inline styles only. */
export function weeklyReportHtml(r: WeeklyReport, lang: ReportLang, appUrl: string, workspace?: string | null): string {
  const t = T[lang];
  const tag = lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB';
  const num = (n: number) => new Intl.NumberFormat(tag).format(n);
  const money = (n: number) => (n > 0 ? new Intl.NumberFormat(tag, { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(n) : '');
  const day = (d: Date) => new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' }).format(d);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const align = lang === 'ar' ? 'right' : 'left';
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Tahoma,Arial,sans-serif";
  const root = appUrl.replace(/\/$/, '');
  // Every link opens in the workspace the report is about.
  const at = (path: string) => root + workspaceLink(path, workspace);

  const delta = ([now, before]: [number, number]) => {
    if (now === before) return `<span style="color:#71717a">${t.same}</span>`;
    const up = now > before;
    const pct = before === 0 ? '' : ` ${num(Math.round((Math.abs(now - before) / before) * 100))}%`;
    return `<span style="color:${up ? '#15803d' : '#b91c1c'}">${up ? '▲' : '▼'}${pct || ` ${num(Math.abs(now - before))}`}</span> <span style="color:#a1a1aa">${t.vsLast}</span>`;
  };
  const tile = (label: string, pair: [number, number]) => `
    <td width="50%" style="padding:6px" valign="top">
      <div style="border:1px solid #e7e5df;border-radius:14px;padding:16px 16px 14px;background:#ffffff">
        <div style="font-size:12px;color:#71717a">${label}</div>
        <div style="font-size:30px;font-weight:700;color:#18181b;line-height:1.2;margin-top:4px">${num(pair[0])}</div>
        <div style="font-size:12px;margin-top:4px">${delta(pair)}</div>
      </div>
    </td>`;
  const section = (title: string, body: string) => `
    <tr><td style="padding:22px 24px 0">
      <div style="font-size:15px;font-weight:700;color:#18181b;margin-bottom:8px">${title}</div>
      ${body}
    </td></tr>`;

  let sections = '';
  if (isQuietWeek(r)) {
    sections += section(t.weekOf, `<p style="margin:0;font-size:14px;line-height:1.7;color:#52525b">${t.quiet}</p>`);
  } else {
    if (r.waiting.total) {
      const rows = r.waiting.top
        .map(
          (l) => `
          <tr>
            <td style="padding:10px 0;border-top:1px solid #f1f0ec">
              <div style="font-size:14px;font-weight:600;color:#18181b">${esc(l.name || t.unknown)}</div>
              <div style="font-size:12px;color:#71717a">${[l.company ? esc(l.company) : '', t.waitingFor(t.hours(l.hours))].filter(Boolean).join(' · ')}</div>
            </td>
            <td style="padding:10px 0;border-top:1px solid #f1f0ec" align="${lang === 'ar' ? 'left' : 'right'}">
              <a href="${at(`/leads?lead=${encodeURIComponent(l.id)}`)}" style="font-size:13px;font-weight:600;color:#2563eb;text-decoration:none">${t.reply}</a>
            </td>
          </tr>`,
        )
        .join('');
      const more = r.waiting.total > r.waiting.top.length ? `<div style="font-size:12px;color:#71717a;padding-top:6px">${t.andMore(r.waiting.total - r.waiting.top.length)}</div>` : '';
      sections += section(
        `<span style="color:#b45309">●</span> ${t.waitingTitle(r.waiting.total)}`,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>${more}`,
      );
    }
    if (r.leads[0]) {
      const lines = [t.responseLine(r.contacted, r.leads[0])];
      if (r.medianReplyHours !== null && r.contacted) lines.push(t.medianLine(t.hours(r.medianReplyHours)));
      if (r.won.count) lines.push(t.won(r.won.count, money(r.won.value)));
      sections += section(t.response, `<p style="margin:0;font-size:14px;line-height:1.7;color:#3f3f46">${lines.join(' ')}</p>`);
    } else if (r.won.count) {
      sections += section(t.response, `<p style="margin:0;font-size:14px;line-height:1.7;color:#3f3f46">${t.won(r.won.count, money(r.won.value))}</p>`);
    }
    if (r.members.length) {
      const rows = r.members
        .map(
          (m, i) => `
          <tr>
            <td style="padding:8px 0;border-top:1px solid #f1f0ec;font-size:14px;color:#18181b"><span style="color:#a1a1aa">${num(i + 1)}.</span> ${esc(m.name)}</td>
            <td style="padding:8px 0;border-top:1px solid #f1f0ec;font-size:12px;color:#71717a" align="${lang === 'ar' ? 'left' : 'right'}">${t.teamLine(m.leads, m.scans)}</td>
          </tr>`,
        )
        .join('');
      const chip = r.topChip ? `<p style="margin:10px 0 0;font-size:12px;color:#71717a">${t.chip(esc(r.topChip.label), r.topChip.scans)}</p>` : '';
      sections += section(t.team, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>${chip}`);
    }
  }

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(weeklyReportSubject(r, lang))}</title></head>
<body style="margin:0;padding:0;background:#f4f3ef">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3ef"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:600px;background:#fbfaf7;border-radius:18px;font-family:${font};text-align:${align}">
  <tr><td style="padding:24px 24px 4px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:32px;height:32px;background:#2563eb;border-radius:9px;color:#ffffff;font-weight:800;font-size:16px;text-align:center;vertical-align:middle">V</td>
      <td style="padding:0 10px;font-size:14px;font-weight:600;color:#18181b">Vertex Connect</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:14px 24px 0">
    <div style="font-size:22px;font-weight:700;color:#18181b">${t.weekOf}: ${esc(r.orgName)}</div>
    <div style="font-size:13px;color:#71717a;margin-top:2px">${day(r.from)} – ${day(r.to)}</div>
  </td></tr>
  ${
    isQuietWeek(r)
      ? ''
      : `<tr><td style="padding:14px 18px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${tile(t.leads, r.leads)}${tile(t.reached, r.reached)}</tr>
      <tr>${tile(t.taps, r.taps)}${tile(t.meetings, r.meetings)}</tr>
    </table>
  </td></tr>`
  }
  ${sections}
  <tr><td style="padding:26px 24px 8px" align="center">
    <a href="${at('/dashboard')}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:12px">${t.open}</a>
  </td></tr>
  <tr><td style="padding:14px 24px 24px;font-size:12px;color:#a1a1aa;line-height:1.6" align="center">
    ${t.footer(esc(r.orgName))} <a href="${at('/notifications?settings=1')}" style="color:#71717a">${t.turnOff}</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
