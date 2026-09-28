import { describe as suite, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { bucketOf, describe, linkOf, toneOf, type Notif } from './model';

/** A stand-in t(): echoes the key and its values, so the tests read the choice made. */
const t = ((key: string, opts?: Record<string, unknown>) => {
  const vals = Object.entries(opts ?? {})
    .filter(([k]) => k !== 'defaultValue')
    .map(([k, v]) => `${k}=${String(v).replace(/[⁨⁩]/g, '')}`);
  return vals.length ? `${key}(${vals.join(',')})` : key;
}) as unknown as TFunction;

const base: Notif = {
  id: 'n1',
  type: 'x',
  category: 'SYSTEM',
  priority: 'MEDIUM',
  title: 'Stored title',
  body: 'Stored body',
  metadata: {},
  readAt: null,
  createdAt: new Date().toISOString(),
  actor: null,
};
const n = (patch: Partial<Notif>): Notif => ({ ...base, ...patch });

suite('describe', () => {
  it('names a lead by what the visitor asked for, keeping their details', () => {
    const out = describe(n({ type: 'lead.captured', category: 'CRM', metadata: { intent: 'QUOTE' }, body: 'Sara · Acme' }), t);
    expect(out).toEqual({ title: 'notifications:types.lead.QUOTE', body: 'Sara · Acme' });
  });

  it('says who did it when someone did', () => {
    const actor = { name: 'Omar', email: 'o@x.co' };
    expect(describe(n({ type: 'team.created', metadata: { name: 'Sales' }, actor }), t).title).toBe('notifications:types.teamCreatedBy(name=Sales,actor=Omar)');
    expect(describe(n({ type: 'team.created', metadata: { name: 'Sales' } }), t).title).toBe('notifications:types.teamCreated(name=Sales)');
  });

  it('reads the event of a failure in words', () => {
    expect(describe(n({ type: 'webhook.failed', metadata: { event: 'nfc.tapped' } }), t).body).toBe(
      'notifications:types.webhookFailedBody(event=integrations:events.nfc.tapped)',
    );
  });

  it('shows what people wrote themselves as they wrote it', () => {
    // An automation's own message is the owner's words, not ours to translate.
    expect(describe(n({ type: 'automation.triggered', title: 'Call them', body: 'Now' }), t)).toEqual({ title: 'Call them', body: 'Now' });
    expect(describe(n({ type: 'something.new' }), t)).toEqual({ title: 'Stored title', body: 'Stored body' });
  });
});

suite('linkOf', () => {
  it('opens the lead a notification is about', () => {
    expect(linkOf(n({ type: 'lead.captured', metadata: { leadId: 'l1' } }))).toBe('/leads?lead=l1');
    expect(linkOf(n({ type: 'automation.triggered', metadata: { data: { leadId: 'l2' } } }))).toBe('/leads?lead=l2');
  });

  it('sends failures to where they can be fixed', () => {
    expect(linkOf(n({ type: 'webhook.failed' }))).toBe('/integrations?tab=webhooks');
    expect(linkOf(n({ type: 'automation.failed' }))).toBe('/integrations?tab=automations');
  });

  it('opens the team that was created, and nothing for what has no page', () => {
    expect(linkOf(n({ type: 'team.created', metadata: { teamId: 't1' } }))).toBe('/team?team=t1');
    expect(linkOf(n({ type: 'approval.approved' }))).toBeNull();
  });
});

suite('toneOf and bucketOf', () => {
  it('makes failures and suspensions stand out', () => {
    expect(toneOf(n({ type: 'webhook.failed' }))).toBe('danger');
    expect(toneOf(n({ type: 'member.suspended' }))).toBe('warning');
    expect(toneOf(n({ type: 'lead.captured', category: 'CRM' }))).toBe('accent');
  });

  it('groups by day', () => {
    const now = new Date();
    expect(bucketOf(now.toISOString())).toBe('today');
    expect(bucketOf(new Date(now.getTime() - 30 * 86_400_000).toISOString())).toBe('earlier');
  });
});
