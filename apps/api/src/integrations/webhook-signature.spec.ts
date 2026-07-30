import { signWebhook, verifyWebhook } from './webhook-signature';

/**
 * The signature is the whole trust model for outbound webhooks: it proves the
 * payload came from us and is fresh. These assert that a genuine signature
 * verifies and that every way of faking or replaying one fails.
 */

const SECRET = 'whsec_test_abcdef0123456789';
const BODY = JSON.stringify({ event: 'lead.created', data: { id: 'lead_1' } });
const NOW = 1_800_000_000;

describe('webhook signature', () => {
  it('verifies a signature it just produced', () => {
    const header = signWebhook(BODY, SECRET, NOW);
    expect(verifyWebhook(BODY, SECRET, header, { now: NOW })).toBe(true);
  });

  it('rejects a body that was altered after signing', () => {
    const header = signWebhook(BODY, SECRET, NOW);
    const tampered = BODY.replace('lead_1', 'lead_2');
    expect(verifyWebhook(tampered, SECRET, header, { now: NOW })).toBe(false);
  });

  it('rejects verification with the wrong secret', () => {
    const header = signWebhook(BODY, SECRET, NOW);
    expect(verifyWebhook(BODY, 'whsec_wrong', header, { now: NOW })).toBe(false);
  });

  it('rejects a replayed payload outside the tolerance window', () => {
    const header = signWebhook(BODY, SECRET, NOW - 10_000);
    expect(verifyWebhook(BODY, SECRET, header, { now: NOW })).toBe(false);
  });

  it('accepts a payload within the tolerance window', () => {
    const header = signWebhook(BODY, SECRET, NOW - 60);
    expect(verifyWebhook(BODY, SECRET, header, { now: NOW })).toBe(true);
  });

  it('rejects a missing or malformed header', () => {
    expect(verifyWebhook(BODY, SECRET, undefined, { now: NOW })).toBe(false);
    expect(verifyWebhook(BODY, SECRET, 'garbage', { now: NOW })).toBe(false);
    expect(verifyWebhook(BODY, SECRET, 't=only', { now: NOW })).toBe(false);
    expect(verifyWebhook(BODY, SECRET, `v1=deadbeef`, { now: NOW })).toBe(false);
  });

  it('rejects a forged signature of the right shape', () => {
    const forged = `t=${NOW},v1=${'a'.repeat(64)}`;
    expect(verifyWebhook(BODY, SECRET, forged, { now: NOW })).toBe(false);
  });

  it('emits the documented header shape', () => {
    const header = signWebhook(BODY, SECRET, NOW);
    expect(header).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
  });
});
