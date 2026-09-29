import { buildIcs, googleCalendarLink, icsText } from './ics';

const event = {
  uid: 'act1@vertex-connect',
  start: new Date('2026-10-01T09:00:00Z'),
  minutes: 30,
  title: 'Meeting: Omar Adel, Mariam Khaled',
  description: 'Line one\nAbout; the fit-out, phase 2',
  url: 'https://app.example/c/mariam',
  organizer: { name: 'Mariam Khaled', email: 'mariam@example.com' },
  attendee: { name: 'Omar: Adel', email: 'omar@example.com' },
  stamp: new Date('2026-09-29T10:00:00Z'),
};

describe('buildIcs', () => {
  const ics = buildIcs(event);
  const lines = ics.split('\r\n');

  it('writes one confirmed event, in UTC', () => {
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20261001T090000Z');
    expect(ics).toContain('DTEND:20261001T093000Z');
    expect(ics).toContain('DTSTAMP:20260929T100000Z');
    expect(ics).toContain('UID:act1@vertex-connect');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('escapes text and quotes names that need it', () => {
    expect(ics).toContain('SUMMARY:Meeting: Omar Adel\\, Mariam Khaled');
    expect(ics).toContain('DESCRIPTION:Line one\\nAbout\; the fit-out\\, phase 2');
    expect(ics).toContain('ATTENDEE;CN="Omar: Adel";ROLE=REQ-PARTICIPANT:mailto:omar@example.com');
    expect(icsText('a\\b')).toBe('a\\\\b');
  });

  it('folds long lines at 75 bytes without splitting a letter', () => {
    const long = buildIcs({ ...event, description: 'اجتماع '.repeat(40) });
    for (const l of long.split('\r\n')) expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75);
    const unfolded = long.replace(/\r\n /g, '');
    expect(unfolded).toContain(`DESCRIPTION:${'اجتماع '.repeat(40)}`);
  });

  it('leaves out who is attending when there is no email', () => {
    expect(buildIcs({ ...event, attendee: { name: 'Omar' } })).not.toContain('ATTENDEE');
  });
});

describe('googleCalendarLink', () => {
  it('opens Google Calendar with the event filled in', () => {
    const u = new URL(googleCalendarLink(event));
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(u.searchParams.get('dates')).toBe('20261001T090000Z/20261001T093000Z');
    expect(u.searchParams.get('text')).toBe(event.title);
    expect(u.searchParams.get('details')).toContain('https://app.example/c/mariam');
  });
});
