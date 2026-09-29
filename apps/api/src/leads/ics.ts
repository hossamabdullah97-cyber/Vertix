/**
 * A calendar invite (RFC 5545) for one meeting, and the same meeting as a
 * Google Calendar link. Times are written in UTC, which every calendar reads
 * and shows in its owner's own zone.
 */

export interface CalendarEvent {
  uid: string;
  start: Date;
  minutes: number;
  title: string;
  description?: string;
  url?: string;
  organizer?: { name: string; email?: string | null };
  attendee?: { name: string; email?: string | null };
  /** When the invite was made; defaults to now. */
  stamp?: Date;
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Commas, semicolons, backslashes and line breaks are escaped in text values. */
export const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Parameter values (a CN) cannot hold quotes; quoted when they have : ; or ,. */
const param = (s: string) => {
  const v = s.replace(/"/g, "'").replace(/[\r\n]+/g, ' ');
  return /[:;,]/.test(v) ? `"${v}"` : v;
};

/** Lines longer than 75 bytes continue on the next line after a space. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(e: CalendarEvent): string {
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vertex Connect//Meetings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${utc(e.stamp ?? new Date())}`,
    `DTSTART:${utc(e.start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${icsText(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    ...(e.organizer?.email ? [`ORGANIZER;CN=${param(e.organizer.name)}:mailto:${e.organizer.email}`] : []),
    ...(e.attendee?.email ? [`ATTENDEE;CN=${param(e.attendee.name)};ROLE=REQ-PARTICIPANT:mailto:${e.attendee.email}`] : []),
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'TRIGGER:-PT15M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function googleCalendarLink(e: CalendarEvent): string {
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${utc(e.start)}/${utc(end)}`,
    ...(e.description || e.url ? { details: [e.description, e.url].filter(Boolean).join('\n\n') } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}
