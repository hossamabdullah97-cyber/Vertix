import { describe, expect, it, jest } from '@jest/globals';
import { awaitsReply, filterLeads, returnedAt, search, waitingHours, whatsappHref, type Lead } from './crm';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const H = 3_600_000;
const lead = (o: Partial<Lead>): Lead => ({
  id: 'l',
  name: null,
  email: null,
  phone: null,
  company: null,
  score: 0,
  value: 0,
  temperature: 'COLD',
  source: 'card',
  stageId: null,
  createdAt: new Date(NOW - H).toISOString(),
  card: null,
  ...o,
});

describe('waiting for a reply', () => {
  it('counts hours until someone reaches out', () => {
    expect(waitingHours(lead({ createdAt: new Date(NOW - 30 * H).toISOString() }), NOW)).toBe(30);
    expect(waitingHours(lead({ firstContactedAt: new Date(NOW).toISOString() }), NOW)).toBeNull();
  });
  it('flags after a day and gives up after two weeks', () => {
    expect(awaitsReply(lead({ createdAt: new Date(NOW - 2 * H).toISOString() }), NOW)).toBe(false);
    expect(awaitsReply(lead({ createdAt: new Date(NOW - 25 * H).toISOString() }), NOW)).toBe(true);
    expect(awaitsReply(lead({ createdAt: new Date(NOW - 15 * 24 * H).toISOString() }), NOW)).toBe(false);
  });
});

describe('came back', () => {
  it('ignores the visit they signed up on and old visits', () => {
    const createdAt = new Date(NOW - 48 * H).toISOString();
    expect(returnedAt(lead({ createdAt, lastVisitAt: new Date(NOW - 48 * H + 60_000).toISOString() }), NOW)).toBeNull();
    const back = new Date(NOW - 2 * H).toISOString();
    expect(returnedAt(lead({ createdAt, lastVisitAt: back }), NOW)).toBe(back);
    expect(returnedAt(lead({ createdAt: new Date(NOW - 30 * 24 * H).toISOString(), lastVisitAt: new Date(NOW - 8 * 24 * H).toISOString() }), NOW)).toBeNull();
  });
});

describe('whatsappHref', () => {
  it('understands Egyptian and international numbers', () => {
    expect(whatsappHref('010 1234 5678')).toBe('https://wa.me/201012345678');
    expect(whatsappHref('+44 7700 900123', 'Hi')).toBe('https://wa.me/447700900123?text=Hi');
    expect(whatsappHref('0020 101 234 5678')).toBe('https://wa.me/201012345678');
    expect(whatsappHref('123')).toBeNull();
  });
});

describe('search and filters', () => {
  const leads = [
    lead({ id: 'a', name: 'Sara Adel', company: 'Nile', phone: '01012345678', temperature: 'HOT' }),
    lead({ id: 'b', name: 'Omar', email: 'omar@x.io', createdAt: new Date(NOW - 30 * H).toISOString() }),
  ];
  it('matches names, companies, emails and phone digits', () => {
    expect(search(leads, 'nile').map((l) => l.id)).toEqual(['a']);
    expect(search(leads, 'OMAR@').map((l) => l.id)).toEqual(['b']);
    expect(search(leads, '1234').map((l) => l.id)).toEqual(['a']);
    expect(search(leads, '  ')).toHaveLength(2);
  });
  it('filters hot and waiting leads', () => {
    expect(filterLeads(leads, 'hot', NOW).map((l) => l.id)).toEqual(['a']);
    expect(filterLeads(leads, 'waiting', NOW).map((l) => l.id)).toEqual(['b']);
    expect(filterLeads(leads, 'all', NOW)).toHaveLength(2);
  });
});
