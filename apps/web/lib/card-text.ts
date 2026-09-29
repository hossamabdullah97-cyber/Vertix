/**
 * Turns what was read off a business card into a contact, without any
 * outside service: a QR code's vCard when the card has one (exact), else the
 * card's text lines, sorted into fields by what they look like. Emails,
 * phones and websites are certain; name, title and company are best guesses
 * the person checks before saving.
 */

export interface CardContact {
  name: string | null;
  nameAlt: string | null;
  title: string | null;
  company: string | null;
  emails: string[];
  phones: string[];
  website: string | null;
  address: string | null;
}

export interface TextLine {
  text: string;
  /** Letter height in pixels, when known: the name is usually the biggest. */
  height?: number;
}

const EMPTY: CardContact = { name: null, nameAlt: null, title: null, company: null, emails: [], phones: [], website: null, address: null };

/** Arabic-Indic and Persian digits as 0-9. */
export function latinDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|eg|sa|ae|me|info|biz|app|dev|tech|studio|design|agency|com\.eg|com\.sa)(?:\/[^\s]*)?/i;
const PHONE = /(?:\+|00)?\d[\d\s().\-/]{6,}\d/g;

// Words that label a contact line. One-letter ones (T:, م:) only with their colon, so a name that
// starts with that letter (مريم) keeps it.
const LABEL = /^\s*(?:(?:tel|phone|mobile|mob|cell|fax|whatsapp|e-?mail|website|web|site|address|addr|هاتف|تليفون|موبايل|جوال|فاكس|واتساب|البريد|بريد|الموقع|العنوان)\s*[:.\-]?|(?:t|m|f|e|w|p|ت|م|ف)\s*[:.])\s*/i;

const TITLE_WORDS = [
  'manager', 'director', 'engineer', 'ceo', 'cto', 'cfo', 'coo', 'founder', 'co-founder', 'partner', 'head', 'lead', 'officer', 'president',
  'vice', 'consultant', 'specialist', 'designer', 'developer', 'architect', 'accountant', 'executive', 'sales', 'marketing', 'supervisor',
  'coordinator', 'analyst', 'advisor', 'representative', 'agent', 'owner', 'chairman', 'associate', 'assistant', 'dr.', 'doctor', 'lawyer',
  'مدير', 'مديرة', 'مهندس', 'مهندسة', 'رئيس', 'رئيسة', 'مسؤول', 'مسئول', 'أخصائي', 'اخصائي', 'مستشار', 'مصمم', 'مصممة', 'محاسب', 'مؤسس',
  'شريك', 'تنفيذي', 'مندوب', 'مشرف', 'منسق', 'محلل', 'نائب', 'دكتور', 'محامي', 'استشاري', 'مطور', 'مبيعات', 'تسويق',
];
const COMPANY_WORDS = [
  'co.', 'company', 'ltd', 'llc', 'inc', 'corp', 'group', 'holding', 'studio', 'agency', 'solutions', 'systems', 'technologies', 'tech',
  'consulting', 'industries', 'trading', 'international', 'enterprises', 'partners', 'bank', 'hospital', 'clinic', 'university', 's.a.e',
  'شركة', 'مؤسسة', 'مجموعة', 'للمقاولات', 'للتجارة', 'للاستثمار', 'للتطوير', 'للحلول', 'القابضة', 'مكتب', 'استوديو', 'ستوديو', 'بنك', 'مستشفى', 'عيادة', 'جامعة',
];
const ADDRESS_WORDS = [
  'street', 'st.', 'road', 'rd.', 'floor', 'building', 'bldg', 'tower', 'office', 'suite', 'district', 'cairo', 'giza', 'alexandria', 'egypt',
  'dubai', 'riyadh', 'jeddah', 'p.o', 'box', 'شارع', 'ش.', 'طريق', 'الدور', 'دور', 'مبنى', 'عمارة', 'برج', 'مكتب رقم', 'القاهرة', 'الجيزة',
  'الإسكندرية', 'الاسكندرية', 'مصر', 'دبي', 'الرياض', 'جدة', 'ص.ب', 'التجمع', 'المعادي', 'الزمالك', 'مدينة نصر',
];
const FREE_MAIL = /^(gmail|yahoo|hotmail|outlook|live|icloud|me|aol|proton|protonmail|mail|yandex)\./i;

const has = (words: string[], s: string) => {
  const low = s.toLowerCase();
  return words.some((w) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(low));
};
const isArabic = (s: string) => /[؀-ۿ]/.test(s);
const letters = (s: string) => (s.match(/\p{L}/gu) ?? []).length;
const tidy = (s: string) =>
  s
    // Invisible direction marks the reader leaves around Arabic.
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    // A lone dot between words (·, or a ٠ it was mistaken for) is a separator.
    .replace(/\s[·•٠]\s/g, ' · ')
    .replace(/[|_~•*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** A name: 2–5 words, mostly letters, not a title, company or address. */
function nameLike(s: string): boolean {
  const words = s.split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  if (letters(s) < s.replace(/\s/g, '').length * 0.85) return false;
  return !has(TITLE_WORDS, s) && !has(COMPANY_WORDS, s) && !has(ADDRESS_WORDS, s);
}

/** Phone numbers in a line, as printed but trimmed; at least 8 digits each. */
function phonesIn(s: string): string[] {
  return (latinDigits(s).match(PHONE) ?? []).map((p) => p.trim()).filter((p) => (p.match(/\d/g) ?? []).length >= 8);
}

export function contactFromText(input: TextLine[] | string): CardContact {
  const lines: TextLine[] = (typeof input === 'string' ? input.split(/\r?\n/).map((text) => ({ text })) : input)
    .map((l) => ({ ...l, text: tidy(l.text) }))
    .filter((l) => letters(l.text) + (l.text.match(/\d/g) ?? []).length >= 2);

  const c: CardContact = { ...EMPTY, emails: [], phones: [] };
  const rest: TextLine[] = [];

  for (const line of lines) {
    let t = line.text;
    const emails = t.match(EMAIL) ?? [];
    for (const e of emails) if (!c.emails.includes(e.toLowerCase())) c.emails.push(e.toLowerCase());
    t = t.replace(EMAIL, ' ');
    const url = t.match(URL_RE)?.[0];
    if (url && !c.website) c.website = url.replace(/[.,;]+$/, '');
    if (url) t = t.replace(url, ' ');
    const phones = phonesIn(t);
    for (const p of phones) if (!c.phones.includes(p)) c.phones.push(p);
    if (phones.length) t = latinDigits(t).replace(PHONE, ' ');
    t = tidy(t.replace(LABEL, ''));
    // What is left of a contact line is usually just its label.
    if ((emails.length || url || phones.length) && letters(t) < 4) continue;
    if (letters(t) >= 2) rest.push({ ...line, text: t });
  }

  for (const line of rest) {
    if (!c.address && has(ADDRESS_WORDS, line.text) && !has(TITLE_WORDS, line.text)) {
      c.address = line.text;
      line.text = '';
    }
  }
  for (const line of rest) {
    if (line.text && !c.title && has(TITLE_WORDS, line.text) && !has(COMPANY_WORDS, line.text)) {
      c.title = line.text;
      line.text = '';
    }
  }
  for (const line of rest) {
    if (line.text && !c.company && has(COMPANY_WORDS, line.text)) {
      c.company = line.text;
      line.text = '';
    }
  }

  // The name: the biggest name-like line; the other script's version, if any, is kept too.
  const names = rest.filter((l) => l.text && nameLike(l.text)).sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  if (names[0]) {
    c.name = names[0].text;
    const alt = names.find((l) => l !== names[0] && isArabic(l.text) !== isArabic(names[0]!.text));
    if (alt) c.nameAlt = alt.text;
  }

  // No company line: the email's domain says it, unless it is a free mailbox.
  if (!c.company) {
    const domain = c.emails.map((e) => e.split('@')[1]!).find((d) => !FREE_MAIL.test(d));
    if (domain) {
      const word = domain.split('.')[0]!;
      c.company = word.charAt(0).toUpperCase() + word.slice(1);
    }
  }
  return c;
}

/** Undoes vCard escaping (\, \; \n). */
const unescape = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

/**
 * A QR code's content as a contact: vCard (BEGIN:VCARD) and MECARD are read
 * exactly; a bare link becomes the website. Anything else gives null.
 */
export function contactFromQr(raw: string): CardContact | null {
  const text = raw.trim();
  if (/^BEGIN:VCARD/i.test(text)) {
    // Folded lines continue after a newline and a space.
    const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    const c: CardContact = { ...EMPTY, emails: [], phones: [] };
    let n: string | null = null;
    const addr: string[] = [];
    for (const line of lines) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const key = line.slice(0, i).split(';')[0]!.toUpperCase().replace(/^ITEM\d+\./, '');
      const value = line.slice(i + 1);
      if (key === 'FN') c.name = unescape(value) || c.name;
      else if (key === 'N') n = value.split(';').slice(0, 2).reverse().map(unescape).filter(Boolean).join(' ') || null;
      else if (key === 'ORG') c.company = unescape(value.split(';')[0] ?? '') || c.company;
      else if (key === 'TITLE') c.title = unescape(value) || c.title;
      else if (key === 'EMAIL' && value.trim()) c.emails.push(unescape(value).toLowerCase());
      else if (key === 'TEL' && value.trim()) c.phones.push(unescape(value.replace(/^tel:/i, '')));
      else if (key === 'URL' && !c.website) c.website = unescape(value);
      else if (key === 'ADR') addr.push(value.split(';').map(unescape).filter(Boolean).join(', '));
    }
    c.name ??= n;
    c.address = addr[0] || null;
    return c.name || c.emails.length || c.phones.length ? c : null;
  }
  if (/^MECARD:/i.test(text)) {
    const c: CardContact = { ...EMPTY, emails: [], phones: [] };
    for (const part of text.slice(7).split(/(?<!\\);/)) {
      const i = part.indexOf(':');
      if (i < 0) continue;
      const key = part.slice(0, i).toUpperCase();
      const value = unescape(part.slice(i + 1));
      if (!value) continue;
      if (key === 'N') c.name = value.includes(',') ? value.split(',').reverse().join(' ').trim() : value;
      else if (key === 'TEL') c.phones.push(value);
      else if (key === 'EMAIL') c.emails.push(value.toLowerCase());
      else if (key === 'URL') c.website ??= value;
      else if (key === 'ORG') c.company = value;
      else if (key === 'ADR') c.address = value;
    }
    return c.name || c.emails.length || c.phones.length ? c : null;
  }
  if (/^https?:\/\/\S+$/i.test(text)) return { ...EMPTY, emails: [], phones: [], website: text };
  return null;
}

/** Fills what the first contact lacks from the second (QR link + printed text). */
export function mergeContacts(a: CardContact, b: CardContact): CardContact {
  return {
    name: a.name ?? b.name,
    nameAlt: a.nameAlt ?? b.nameAlt,
    title: a.title ?? b.title,
    company: a.company ?? b.company,
    emails: [...new Set([...a.emails, ...b.emails])],
    phones: [...new Set([...a.phones, ...b.phones])],
    website: a.website ?? b.website,
    address: a.address ?? b.address,
  };
}
