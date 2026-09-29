import { alertEmail, alertWhatsApp, escapeHtml, meetingTime, normalizePhone, type LeadAlert } from './lead-alert';

const lead: LeadAlert = {
  leadId: 'lead1',
  intent: 'MEETING',
  name: 'Omar <b>Adel</b>',
  email: 'omar@example.com',
  phone: '010 0123 4567',
  company: 'Nile Co',
  note: 'Line one\nLine two',
  meetingAt: '2026-10-01T09:00:00.000Z',
  timezone: 'Africa/Cairo',
  cardName: 'Mariam Khaled',
  link: 'https://app.example/leads?lead=lead1',
};

describe('normalizePhone', () => {
  it('reads international and Egyptian local numbers', () => {
    expect(normalizePhone('+20 100 123 4567')).toBe('201001234567');
    expect(normalizePhone('00201001234567')).toBe('201001234567');
    expect(normalizePhone('01001234567')).toBe('201001234567');
    expect(normalizePhone('(971) 50-123-4567')).toBe('971501234567');
  });

  it('refuses what cannot be a number', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('+0100')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
  });
});

describe('alertEmail', () => {
  it('escapes what the visitor typed', () => {
    const { html, subject } = alertEmail(lead, 'en');
    expect(subject).toBe('Omar <b>Adel</b> asked to meet');
    expect(html).toContain('Omar &lt;b&gt;Adel&lt;/b&gt;');
    expect(html).not.toContain('<b>Adel</b>');
    expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;');
  });

  it('shows the meeting in the owner’s time, the card, and a WhatsApp reply', () => {
    const { html } = alertEmail(lead, 'en');
    expect(html).toContain(escapeHtml(meetingTime(lead.meetingAt!, 'Africa/Cairo', 'en')));
    expect(meetingTime(lead.meetingAt!, 'Africa/Cairo', 'en')).toMatch(/12:00/);
    expect(html).toContain('From your card “\u2068Mariam Khaled\u2069”');
    expect(html).toContain('https://wa.me/201001234567');
    expect(html).toContain('href="https://app.example/leads?lead=lead1"');
  });

  it('is written right to left in Arabic', () => {
    const { html, subject } = alertEmail({ ...lead, intent: 'QUOTE', name: 'عمر' }, 'ar');
    expect(subject).toBe('عمر يطلب عرض سعر');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('افتح العميل');
  });

  it('leaves out what was not given', () => {
    const { html } = alertEmail({ ...lead, intent: 'CONTACT', phone: null, company: '', meetingAt: null, note: null }, 'en');
    expect(html).not.toContain('wa.me');
    expect(html).not.toContain('Company');
    expect(html).not.toContain('Meeting');
  });
});

describe('alertWhatsApp', () => {
  it('fills the template’s three parameters, on one line each', () => {
    const [kind, name, details] = alertWhatsApp({ ...lead, name: 'Omar\nAdel' }, 'en');
    expect(kind).toBe('Meeting request');
    expect(name).toBe('Omar Adel');
    expect(details).toContain('Company: Nile Co');
    expect(details).toContain('Phone: 010 0123 4567');
    expect(details).not.toContain('Line one');
    expect(details).not.toMatch(/[\n\t]/);
  });

  it('says which card when there is nothing else', () => {
    expect(alertWhatsApp({ ...lead, intent: 'CONTACT', phone: null, company: null, meetingAt: null }, 'ar')[2]).toBe('من بطاقتك «\u2068Mariam Khaled\u2069»');
  });
});
