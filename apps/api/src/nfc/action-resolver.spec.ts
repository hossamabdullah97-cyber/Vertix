import { resolveActionTarget } from './action-resolver';

const ctx = {
  vcardUrl: 'https://api.test/c/jane/vcard',
  cardPageUrl: 'https://web.test/c/jane',
};

describe('resolveActionTarget', () => {
  it('builds a wa.me link and strips non-digits from the phone', () => {
    const url = resolveActionTarget(
      { type: 'WHATSAPP', config: { phone: '+20 100 123 4567', text: 'Hi there' } },
      ctx,
    );
    expect(url).toBe('https://wa.me/201001234567?text=Hi%20there');
  });

  it('omits the text query when no message is set', () => {
    expect(
      resolveActionTarget({ type: 'WHATSAPP', config: { phone: '111' } }, ctx),
    ).toBe('https://wa.me/111');
  });

  it('builds tel and mailto links', () => {
    expect(resolveActionTarget({ type: 'CALL', config: { phone: '+1555' } }, ctx)).toBe('tel:+1555');
    expect(resolveActionTarget({ type: 'EMAIL', config: { email: 'a@b.co' } }, ctx)).toBe('mailto:a@b.co');
  });

  it('returns the vCard url for SAVE_CONTACT', () => {
    expect(resolveActionTarget({ type: 'SAVE_CONTACT', config: {} }, ctx)).toBe(ctx.vcardUrl);
  });

  it('passes through url-based actions', () => {
    expect(
      resolveActionTarget({ type: 'WEBSITE', config: { url: 'https://x.dev' } }, ctx),
    ).toBe('https://x.dev');
  });

  it('builds a maps query when no url is provided', () => {
    expect(
      resolveActionTarget({ type: 'MAPS', config: { query: 'Cairo Tower' } }, ctx),
    ).toBe('https://maps.google.com/?q=Cairo%20Tower');
  });

  it('returns null when required config is missing', () => {
    expect(resolveActionTarget({ type: 'WHATSAPP', config: {} }, ctx)).toBeNull();
    expect(resolveActionTarget({ type: 'WEBSITE', config: {} }, ctx)).toBeNull();
    expect(resolveActionTarget({ type: 'CALL', config: {} }, ctx)).toBeNull();
  });

  it('tolerates a non-object config', () => {
    expect(resolveActionTarget({ type: 'WEBSITE', config: null }, ctx)).toBeNull();
  });
});
