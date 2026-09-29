import { readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/** Escapes values per RFC 6350 (vCard). */
function esc(value: unknown): string {
  return String(value)
    .replace(/([,;\\])/g, '\\$1')
    .replace(/\r?\n/g, '\\n');
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The job title and company as stored today. Older cards kept the job title
 * under `org`, so `org` counts as the title when no `title` is set.
 */
export function identityFields(data: Record<string, unknown>): { title: string; company: string } {
  const title = str(data.title) || str(data.org);
  return { title, company: str(data.company) };
}

/** A card action as the public page receives it. */
export interface VCardAction {
  type: string;
  config: unknown;
}

export interface VCardExtras {
  fallbackName?: string;
  /** The public card page, so the saved contact links back to it. */
  cardUrl?: string;
  /** The About text. */
  about?: string;
  /** The contact photo, already encoded (see `photoFromUpload`). */
  photo?: { type: 'JPEG' | 'PNG'; base64: string } | null;
  /** The card's links: phones, emails and web links the vCard may carry. */
  actions?: VCardAction[];
}

/** A web link's label in the address book, from its host. */
function linkLabel(url: string): string {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();
  const known: [RegExp, string][] = [
    [/linkedin\.com$/, 'LinkedIn'],
    [/instagram\.com$/, 'Instagram'],
    [/(facebook|fb)\.com$/, 'Facebook'],
    [/(twitter|x)\.com$/, 'X'],
    [/tiktok\.com$/, 'TikTok'],
    [/(youtube\.com|youtu\.be)$/, 'YouTube'],
    [/github\.com$/, 'GitHub'],
    [/behance\.net$/, 'Behance'],
    [/dribbble\.com$/, 'Dribbble'],
    [/(t\.me|telegram\.me)$/, 'Telegram'],
    [/snapchat\.com$/, 'Snapchat'],
  ];
  return known.find(([re]) => re.test(host))?.[1] ?? 'Website';
}

/** Folds lines longer than 75 octets, as RFC 6350 asks (photos are long). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const out = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) out.push(` ${line.slice(i, i + 74)}`);
  return out.join('\r\n');
}

/**
 * Builds a vCard 3.0 from the card data (vcardData jsonb) and, when given,
 * the card's links, photo and address, so the saved contact is complete:
 * name, title, company, phones, emails, web links, photo and a note.
 */
export function buildVCard(data: Record<string, unknown> = {}, extras: VCardExtras = {}): string {
  const fullName = str(data.fullName) || str(data.name) || extras.fallbackName || '';
  const { title, company } = identityFields(data);

  const phones = new Set<string>();
  const emails = new Set<string>();
  const urls: { url: string; label: string }[] = [];
  const addUrl = (raw: string, label?: string) => {
    if (!/^https?:\/\//i.test(raw) || urls.some((u) => u.url === raw)) return;
    urls.push({ url: raw, label: label ?? linkLabel(raw) });
  };

  if (str(data.phone)) phones.add(str(data.phone));
  if (str(data.email)) emails.add(str(data.email));
  const site = str(data.website) || str(data.url);
  if (site) addUrl(site);

  for (const a of extras.actions ?? []) {
    const c = (a.config && typeof a.config === 'object' ? a.config : {}) as Record<string, unknown>;
    if ((a.type === 'CALL' || a.type === 'WHATSAPP') && str(c.phone)) phones.add(str(c.phone));
    else if (a.type === 'EMAIL' && str(c.email)) emails.add(str(c.email));
    else if ((a.type === 'LINKEDIN' || a.type === 'WEBSITE') && str(c.url)) addUrl(str(c.url));
  }

  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  if (fullName) {
    lines.push(`FN:${esc(fullName)}`);
    // Address books sort by N; split the last word off as the family name.
    const parts = fullName.split(/\s+/);
    const family = parts.length > 1 ? parts.pop()! : '';
    lines.push(`N:${esc(family)};${esc(parts.join(' '))};;;`);
  }
  if (company) lines.push(`ORG:${esc(company)}`);
  if (title) lines.push(`TITLE:${esc(title)}`);
  for (const p of phones) lines.push(`TEL;TYPE=CELL:${esc(p)}`);
  for (const e of emails) lines.push(`EMAIL;TYPE=INTERNET:${esc(e)}`);
  urls.forEach((u, i) => {
    // Grouped labels show as "LinkedIn", "Instagram"… on iPhone and Android.
    lines.push(`item${i + 1}.URL:${esc(u.url)}`, `item${i + 1}.X-ABLabel:${esc(u.label)}`);
  });
  if (extras.cardUrl) {
    const n = urls.length + 1;
    lines.push(`item${n}.URL:${esc(extras.cardUrl)}`, `item${n}.X-ABLabel:Card`);
  }
  if (str(data.location)) lines.push(`ADR;TYPE=WORK:;;${esc(str(data.location))};;;;`);
  if (extras.about) lines.push(`NOTE:${esc(extras.about)}`);
  if (extras.photo) lines.push(`PHOTO;ENCODING=b;TYPE=${extras.photo.type}:${extras.photo.base64}`);
  lines.push('END:VCARD');

  return lines.map(fold).join('\r\n');
}

/** Photos above this are left out rather than bloating the contact file. */
const MAX_PHOTO_BYTES = 1024 * 1024;

/**
 * Reads a photo this API stored itself (a `/uploads/<file>` URL), so the
 * contact file carries the picture. Anything else is skipped: the vCard must
 * never make the server fetch an address a card owner typed.
 */
export function photoFromUpload(url: unknown, uploadDir: string): VCardExtras['photo'] {
  if (typeof url !== 'string') return null;
  let path: string;
  try {
    path = new URL(url, 'http://local').pathname;
  } catch {
    return null;
  }
  const m = path.match(/^\/uploads\/([A-Za-z0-9-]+\.(jpe?g|png))$/i);
  if (!m) return null;
  const file = join(uploadDir, basename(m[1]!));
  try {
    if (statSync(file).size > MAX_PHOTO_BYTES) return null;
    return { type: /png/i.test(m[2]!) ? 'PNG' : 'JPEG', base64: readFileSync(file).toString('base64') };
  } catch {
    return null;
  }
}

/** A file name for the download: the person's name, or "contact". */
export function vcardFileName(fullName: string): string {
  const ascii = fullName
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `${ascii || 'contact'}.vcf`;
}
