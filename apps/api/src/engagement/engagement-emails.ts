/**
 * The tips and reminders emailed to people while they set up, and when leads
 * wait on them: what each says, in English and Arabic. Plain HTML that holds
 * up in mail apps (tables, inline styles), like the weekly report.
 */

export type EngagementKind = 'finishCard' | 'shareCard' | 'inviteTeam' | 'leadsWaiting';
export type EmailLang = 'en' | 'ar';

export interface EngagementData {
  name: string | null;
  /** finishCard / shareCard: the card the email is about, if there is one. */
  cardId?: string | null;
  /** inviteTeam: the workspace. */
  orgName?: string | null;
  /** leadsWaiting: how many, and the first few names. */
  waiting?: number;
  names?: string[];
}

/** An Arabic count with its noun in the right form: 2 → the dual, 3–10 → the plural, 11+ → the singular accusative. */
export function arCount(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return n % 100 >= 3 && n % 100 <= 10 ? `${n} ${few}` : `${n} ${many}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface Copy {
  subject: string;
  heading: string;
  body: string[];
  tips?: string[];
  cta: string;
  path: string;
}

function copy(kind: EngagementKind, d: EngagementData, lang: EmailLang): Copy {
  const first = d.name?.trim().split(/\s+/)[0] ?? '';
  const hi = lang === 'ar' ? (first ? `أهلًا ${first}،` : 'أهلًا،') : first ? `Hi ${first},` : 'Hi,';
  const card = d.cardId ? `/cards/${d.cardId}` : '/cards?new=1';
  const n = d.waiting ?? 0;
  const names = (d.names ?? []).filter(Boolean);
  const T: Record<EmailLang, Record<EngagementKind, Copy>> = {
    en: {
      finishCard: {
        subject: 'Your card is a few minutes from ready',
        heading: 'Finish your card',
        body: [hi, 'Your Vertex Connect card isn’t live yet. Add your photo and how to reach you, then publish it: people can open it from a link, a QR code or a tap of a chip, and save you in one go.'],
        cta: 'Finish my card',
        path: card,
      },
      shareCard: {
        subject: 'Your card is live. Time to share it',
        heading: 'Nobody has opened your card yet',
        body: [hi, 'Your card is published, but it hasn’t had a visitor. A few places it brings people in:'],
        tips: ['In your email signature and WhatsApp status', 'As a QR code on your stand, brochures and paper card', 'On a chip people tap with their phone'],
        cta: 'Share my card',
        path: d.cardId ? `/cards/${d.cardId}?share=1` : '/cards',
      },
      inviteTeam: {
        subject: `Bring your team to ${d.orgName ?? 'Vertex Connect'}`,
        heading: 'Invite your team',
        body: [
          hi,
          `${d.orgName ? esc(d.orgName) : 'Your workspace'} has one person in it so far. Invite your team: each gets a card in the company’s look, and every lead they bring in comes to the company, where nothing is lost when someone leaves.`,
        ],
        cta: 'Invite people',
        path: '/team',
      },
      leadsWaiting: {
        subject: n === 1 ? 'Someone is waiting to hear from you' : `${n} people are waiting to hear from you`,
        heading: n === 1 ? 'A lead is waiting' : `${n} leads are waiting`,
        body: [
          hi,
          `${names.length ? `${names.map(esc).join(', ')}${n > names.length ? ` and ${n - names.length} more` : ''} left` : n === 1 ? 'Someone left' : `${n} people left`} their details on your card and nobody has reached out yet. A quick WhatsApp message now is worth more than a long one next week.`,
        ],
        cta: 'Open my leads',
        path: '/leads',
      },
    },
    ar: {
      finishCard: {
        subject: 'بطاقتك على بُعد دقائق من الجاهزية',
        heading: 'أكمل بطاقتك',
        body: [hi, 'بطاقتك على Vertex Connect لم تُنشر بعد. أضف صورتك وطرق التواصل معك ثم انشرها: يفتحها الناس من رابط أو رمز QR أو بلمسة شريحة، ويحفظونك بضغطة واحدة.'],
        cta: 'أكمل بطاقتي',
        path: card,
      },
      shareCard: {
        subject: 'بطاقتك منشورة. حان وقت مشاركتها',
        heading: 'لم يفتح أحد بطاقتك بعد',
        body: [hi, 'بطاقتك منشورة لكن لم يزرها أحد بعد. أماكن تجلب لك الناس:'],
        tips: ['في توقيع بريدك وحالة واتساب', 'كرمز QR على جناحك وكتيّباتك وبطاقتك الورقية', 'على شريحة يلمسها الناس بهواتفهم'],
        cta: 'شارك بطاقتي',
        path: d.cardId ? `/cards/${d.cardId}?share=1` : '/cards',
      },
      inviteTeam: {
        subject: `ادعُ فريقك إلى ${d.orgName ?? 'Vertex Connect'}`,
        heading: 'ادعُ فريقك',
        body: [
          hi,
          `${d.orgName ? esc(d.orgName) : 'مساحة عملك'} فيها شخص واحد حتى الآن. ادعُ فريقك: يحصل كل منهم على بطاقة بهوية الشركة، وكل عميل يجلبه يأتي للشركة، فلا يضيع شيء حين يغادر أحد.`,
        ],
        cta: 'ادعُ الأشخاص',
        path: '/team',
      },
      leadsWaiting: {
        subject: n === 1 ? 'شخص ينتظر ردّك' : `${arCount(n, 'شخص', 'شخصان', 'أشخاص', 'شخصًا')} ينتظرون ردّك`,
        heading: n === 1 ? 'عميل ينتظرك' : `${arCount(n, 'عميل', 'عميلان', 'عملاء', 'عميلًا')} ينتظرونك`,
        body: [
          hi,
          `${names.length ? `${names.map(esc).join('، ')}${n > names.length ? ` و${arCount(n - names.length, 'شخص آخر', 'شخصان آخران', 'آخرين', 'آخرين')}` : ''} تركوا` : n === 1 ? 'ترك أحدهم' : `${arCount(n, 'شخص', 'شخصان', 'أشخاص', 'شخصًا')} تركوا`} بياناتهم على بطاقتك ولم يتواصل معهم أحد بعد. رسالة واتساب سريعة الآن أنفع من رسالة طويلة الأسبوع القادم.`,
        ],
        cta: 'افتح عملائي',
        path: '/leads',
      },
    },
  };
  return T[lang][kind];
}

export function engagementSubject(kind: EngagementKind, d: EngagementData, lang: EmailLang): string {
  return copy(kind, d, lang).subject;
}

export function engagementHtml(kind: EngagementKind, d: EngagementData, lang: EmailLang, appUrl: string, unsubscribeUrl: string): string {
  const c = copy(kind, d, lang);
  const base = appUrl.replace(/\/$/, '');
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const align = lang === 'ar' ? 'right' : 'left';
  const why =
    lang === 'ar'
      ? 'تصلك هذه الرسائل لتساعدك على الاستفادة من Vertex Connect. <a href="{u}" style="color:#71717a">أوقف هذه الرسائل</a>'
      : 'You get these to help you make the most of Vertex Connect. <a href="{u}" style="color:#71717a">Stop these emails</a>';
  // The body copy is ours (escaped where it carries a name); only the first line greets.
  const paragraphs = c.body.map((p, i) => `<p style="margin:${i ? 12 : 0}px 0 0;font-size:15px;line-height:1.65;color:#3f3f46">${i === 0 ? esc(p) : p}</p>`).join('');
  const tips = c.tips?.length
    ? `<ul style="margin:12px 0 0;padding-${align}:20px;font-size:15px;line-height:1.7;color:#3f3f46">${c.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
    : '';
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f4f4f5;font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:560px;background:#ffffff;border-radius:16px;text-align:${align}">
  <tr><td style="padding:24px 24px 4px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:32px;height:32px;background:#2563eb;border-radius:9px;color:#ffffff;font-weight:800;font-size:16px;text-align:center;vertical-align:middle">V</td>
      <td style="padding:0 10px;font-size:14px;font-weight:600;color:#18181b">Vertex Connect</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:18px 24px 0">
    <div style="font-size:22px;font-weight:700;color:#18181b">${esc(c.heading)}</div>
    <div style="margin-top:12px">${paragraphs}${tips}</div>
  </td></tr>
  <tr><td style="padding:24px 24px 8px" align="center">
    <a href="${base}${c.path}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:12px">${esc(c.cta)}</a>
  </td></tr>
  <tr><td style="padding:14px 24px 24px;font-size:12px;color:#a1a1aa;line-height:1.6" align="center">${why.replace('{u}', esc(unsubscribeUrl))}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
