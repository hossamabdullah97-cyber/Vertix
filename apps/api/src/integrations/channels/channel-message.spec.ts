import { channelMessage, teamsBody, telegramBody, testMessage, wants } from './channel-message';

const opts = { lang: 'en' as const, appUrl: 'https://app.example/', timeZone: 'Africa/Cairo' };
const lead = { leadId: 'lead1', name: 'Laila Hassan', phone: '+201007776655', email: 'laila@example.com', company: 'Nile Co', cardSlug: 'mariam', intent: 'CONTACT' };

describe('what a channel is told', () => {
  it('says who the new lead is, from which card, with a link to open them', () => {
    const m = channelMessage('lead.created', lead, opts)!;
    expect(m.title).toBe('New lead');
    expect(m.facts).toEqual([
      { label: 'Name', value: 'Laila Hassan' },
      { label: 'Phone', value: '+201007776655' },
      { label: 'Email', value: 'laila@example.com' },
      { label: 'Company', value: 'Nile Co' },
      { label: 'Card', value: '/c/mariam' },
    ]);
    expect(m.link).toEqual({ label: 'Open in Vertex Connect', url: 'https://app.example/leads?lead=lead1' });
  });

  it('names a meeting request, and the time asked for in the zone it was booked in, in Arabic', () => {
    const m = channelMessage('lead.created', { ...lead, intent: 'MEETING', meetingAt: '2026-12-01T08:00:00.000Z' }, { ...opts, lang: 'ar' })!;
    expect(m.title).toBe('طلب اجتماع جديد');
    const when = m.facts.find((f) => f.label === 'الموعد المطلوب')!.value;
    // 08:00 UTC is 10:00 in Cairo.
    expect(when).toMatch(/١٠:٠٠|10:00/);
  });

  it('leaves out what the visitor did not give', () => {
    const m = channelMessage('lead.created', { leadId: 'l2', name: 'Omar', phone: '0100' }, opts)!;
    expect(m.facts.map((f) => f.label)).toEqual(['Name', 'Phone']);
  });

  it('is not told about events it does not know', () => {
    expect(channelMessage('card.viewed', {}, opts)).toBeNull();
  });

  it('hears a meeting request once when it asked for new leads too', () => {
    expect(wants(['lead.created', 'meeting.requested'], 'lead.created')).toBe(true);
    expect(wants(['lead.created', 'meeting.requested'], 'meeting.requested')).toBe(false);
    expect(wants(['meeting.requested'], 'meeting.requested')).toBe(true);
    expect(wants(['meeting.requested'], 'lead.created')).toBe(false);
  });
});

describe('the bodies each service takes', () => {
  it('Telegram: bold title, one line per fact, the link as a button, nothing a name could break', () => {
    const m = channelMessage('lead.created', { ...lead, name: 'Tom <b>&</b> Jerry' }, opts)!;
    const body = telegramBody('-100123', m);
    expect(body.chat_id).toBe('-100123');
    expect(body.parse_mode).toBe('HTML');
    expect(body.text).toContain('<b>New lead</b>');
    expect(body.text).toContain('Name: Tom &lt;b&gt;&amp;&lt;/b&gt; Jerry');
    expect(body.reply_markup).toEqual({ inline_keyboard: [[{ text: 'Open in Vertex Connect', url: 'https://app.example/leads?lead=lead1' }]] });
  });

  it('Teams: an Adaptive Card with the facts and an open button, right-to-left in Arabic', () => {
    const m = channelMessage('lead.created', lead, { ...opts, lang: 'ar' })!;
    const body = teamsBody(m, 'ar') as { type: string; attachments: { contentType: string; content: Record<string, unknown> }[] };
    expect(body.type).toBe('message');
    const card = body.attachments[0];
    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(card.content.rtl).toBe(true);
    expect(JSON.stringify(card.content.body)).toContain('"title":"الاسم","value":"Laila Hassan"');
    expect(card.content.actions).toEqual([{ type: 'Action.OpenUrl', title: 'فتح في Vertex Connect', url: 'https://app.example/leads?lead=lead1' }]);
  });

  it('the test message says it is connected', () => {
    expect(telegramBody('1', testMessage('ar', 'https://app.example')).text).toContain('تم ربط Vertex Connect');
  });
});
