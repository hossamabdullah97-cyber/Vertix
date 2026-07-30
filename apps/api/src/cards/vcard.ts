/** Escapes values per RFC 6350 (vCard). */
function esc(value: unknown): string {
  return String(value)
    .replace(/([,;\\])/g, '\\$1')
    .replace(/\n/g, '\\n');
}

/**
 * Builds a vCard 3.0 string from the card data (vcardData jsonb).
 * Expected fields: fullName/name, org, title, phone, email, website/url.
 */
export function buildVCard(
  data: Record<string, unknown> = {},
  fallback: { name?: string } = {},
): string {
  const fullName = data.fullName ?? data.name ?? fallback.name ?? '';
  const website = data.website ?? data.url;

  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  if (fullName) lines.push(`FN:${esc(fullName)}`);
  if (data.org) lines.push(`ORG:${esc(data.org)}`);
  if (data.title) lines.push(`TITLE:${esc(data.title)}`);
  if (data.phone) lines.push(`TEL;TYPE=CELL:${esc(data.phone)}`);
  if (data.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(data.email)}`);
  if (website) lines.push(`URL:${esc(website)}`);
  lines.push('END:VCARD');

  return lines.join('\r\n');
}
