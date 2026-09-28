import { summarize, webhookBody } from './automation-message';

const lead = {
  id: 'evt_1',
  event: 'lead.created',
  data: { name: 'Sara Adel', email: 'sara@acme.co', phone: null, company: 'Acme', cardSlug: 'hossam' },
};

describe('webhookBody', () => {
  it('posts the event as JSON to an ordinary endpoint', () => {
    expect(webhookBody('https://hooks.zapier.com/hooks/catch/1/abc', 'lead.created', lead)).toEqual(lead);
  });

  it('posts a Slack incoming webhook a message it accepts', () => {
    // Slack answers 400 "no_text" to anything without `text`.
    expect(webhookBody('https://hooks.slack.com/services/T0/B0/x', 'lead.created', lead)).toEqual({
      text: 'New lead: Sara Adel · sara@acme.co · Acme (card: hossam)',
    });
  });

  it('does not mistake a look-alike host for Slack', () => {
    expect(webhookBody('https://hooks.slack.com.evil.io/x', 'lead.created', lead)).toHaveProperty('event');
    expect(webhookBody('not a url', 'lead.created', lead)).toHaveProperty('event');
  });
});

describe('summarize', () => {
  it('reads each event it knows as a sentence', () => {
    expect(summarize('meeting.requested', { email: 'a@b.co' })).toBe('Meeting requested by a@b.co');
    expect(summarize('nfc.tapped', { tagUid: '04:A2', cardSlug: 'mariam' })).toBe('NFC chip 04:A2 tapped (card: mariam)');
    expect(summarize('member.added', { email: 'x@y.co', role: 'MANAGER' })).toBe('New member: x@y.co (MANAGER)');
  });

  it('still says something for an event it does not know', () => {
    expect(summarize('qr.scanned', {})).toBe('Vertex Connect: qr.scanned');
  });
});
