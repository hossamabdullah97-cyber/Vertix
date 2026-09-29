import { meetingReplyEmail, meetingWhen, type MeetingReply } from './meeting-mail';

const reply: MeetingReply = {
  decision: 'ACCEPTED',
  visitorName: 'Omar <script>',
  ownerName: 'Mariam Khaled',
  ownerLine: 'Sales Director · Vertex Build',
  meetingAt: new Date('2026-10-01T09:00:00Z'),
  minutes: 30,
  timezone: 'Africa/Cairo',
  message: 'See you at the office.\nSecond floor.',
  cardUrl: 'https://app.example/c/mariam',
  calendarUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE&x=1',
};

describe('meetingReplyEmail', () => {
  it('confirms, with the time in the card’s zone and a calendar link', () => {
    const { subject, html } = meetingReplyEmail(reply, 'en');
    expect(subject).toBe('Your meeting with Mariam Khaled is confirmed');
    expect(meetingWhen(reply.meetingAt, 'Africa/Cairo', 'en')).toMatch(/12:00.*GMT\+3/);
    expect(html).toContain('30 minutes');
    expect(html).toContain('Add to Google Calendar');
    expect(html).toContain('&amp;x=1');
    expect(html).toContain('The calendar invite is attached');
    expect(html).toContain('Second floor.');
  });

  it('escapes names and messages', () => {
    const { html } = meetingReplyEmail({ ...reply, message: '<img src=x>' }, 'en');
    expect(html).toContain('Omar &lt;script&gt;');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<script>');
  });

  it('declines with a way to choose another time, and no invite', () => {
    const { subject, html } = meetingReplyEmail({ ...reply, decision: 'DECLINED', message: null }, 'en');
    expect(subject).toBe('About your meeting request with Mariam Khaled');
    expect(html).toContain('Choose another time');
    expect(html).toContain('href="https://app.example/c/mariam"');
    expect(html).not.toContain('Google Calendar');
    expect(html).not.toContain('attached');
  });

  it('is written right to left in Arabic', () => {
    const { subject, html } = meetingReplyEmail({ ...reply, ownerName: 'مريم خالد' }, 'ar');
    expect(subject).toBe('تم تأكيد اجتماعك مع مريم خالد');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('أضفه إلى تقويم Google');
  });
});
