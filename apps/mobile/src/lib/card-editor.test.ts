import { describe, expect, it } from '@jest/globals';
import {
  aboutOf,
  brandOf,
  identityOf,
  initialConfig,
  isDraft,
  isQuick,
  lookOf,
  normalizeUrl,
  PLATFORMS,
  slugProblem,
  themeOf,
  valueOf,
  vcardWith,
  type ActionType,
} from './card-editor';

const action = (type: ActionType, config: Record<string, unknown> = {}) => ({ type, config, isActive: true });

describe('identity', () => {
  it('reads the fields the app edits, and the job title older cards kept under org', () => {
    const id = identityOf({ vcardData: { fullName: 'Mona', org: 'Designer', phone: 5 } });
    expect(id.fullName).toBe('Mona');
    expect(id.title).toBe('Designer');
    expect(id.phone).toBe('');
  });

  it('keeps what it does not edit (the second language, the languages spoken) and drops emptied fields', () => {
    const card = { vcardData: { fullName: 'Mona', company: 'Acme', alt: { lang: 'ar' }, languages: 'EN, AR' } };
    const next = vcardWith(card, { ...identityOf(card), fullName: '  Mona Adel ', company: '' });
    expect(next).toEqual({ fullName: 'Mona Adel', alt: { lang: 'ar' }, languages: 'EN, AR' });
  });

  it('reads the About from the BIO section', () => {
    const card = { sections: [{ id: 's1', type: 'BIO', order: 0, isVisible: true, content: { body: 'Hi' } }] };
    expect(aboutOf(card)).toEqual({ section: card.sections[0], text: 'Hi' });
    expect(aboutOf({ sections: [] }).text).toBe('');
  });
});

describe('look', () => {
  it('reads the theme as the public card does, with its defaults', () => {
    expect(lookOf({ templateId: 'swiss-blue', theme: null })).toEqual({
      templateId: 'swiss-blue',
      accent: '#2563eb',
      mode: 'light',
      cover: 'gradient',
      layout: 'classic',
      links: 'list',
      lang: 'en',
      brand: true,
      openInApp: false,
    });
    const dark = lookOf({ templateId: 'onyx', theme: { mode: 'dark', accent: 'red', lang: 'ar', brand: false } });
    expect(dark.cover).toBe('constellation');
    expect(dark.accent).toBe('#2563eb');
    expect(dark.lang).toBe('ar');
    expect(dark.brand).toBe(false);
  });

  it('writes the theme without the template id, which is its own field', () => {
    const theme = themeOf(lookOf({ templateId: 'onyx', theme: { accent: '#7f77dd' } }));
    expect(theme).not.toHaveProperty('templateId');
    expect(theme.accent).toBe('#7f77dd');
  });
});

describe('slugProblem', () => {
  it('takes what the server takes', () => {
    expect(slugProblem('mona-adel-2')).toBeNull();
    expect(slugProblem('mo')).toBe('short');
    expect(slugProblem('x'.repeat(61))).toBe('long');
    expect(slugProblem('Mona Adel')).toBe('chars');
    expect(slugProblem('منى')).toBe('chars');
  });
});

describe('buttons', () => {
  it('recognises the site a link goes to', () => {
    expect(brandOf(action('WEBSITE', { url: 'https://instagram.com/mona' })).en).toBe('Instagram');
    expect(brandOf(action('WEBSITE', { url: 'https://x.com/mona' })).en).toBe('X / Twitter');
    // "box.com" is not X.
    expect(brandOf(action('WEBSITE', { url: 'https://dropbox.com/s/1' })).en).toBe('Website');
    expect(brandOf(action('WHATSAPP', { phone: '+20' })).icon).toBe('whatsapp');
  });

  it('reads the destination where each kind keeps it', () => {
    expect(valueOf(action('CALL', { phone: '+201000' }))).toBe('+201000');
    expect(valueOf(action('EMAIL', { email: 'a@b.co' }))).toBe('a@b.co');
    expect(valueOf(action('LINKEDIN', { url: 'https://linkedin.com/in/m' }))).toBe('https://linkedin.com/in/m');
    expect(valueOf(action('SAVE_CONTACT'))).toBe('');
  });

  it('calls a button with nowhere to go a draft, except Save contact', () => {
    expect(isDraft(action('CALL', { phone: ' ' }))).toBe(true);
    expect(isDraft(action('SAVE_CONTACT'))).toBe(false);
    expect(isDraft(action('WEBSITE', { url: 'https://a.co' }))).toBe(false);
  });

  it('puts calling and messaging in the contact row unless moved', () => {
    expect(isQuick(action('CALL'))).toBe(true);
    expect(isQuick(action('WEBSITE'))).toBe(false);
    expect(isQuick(action('CALL', { isQuick: false }))).toBe(false);
    expect(isQuick(action('WEBSITE', { isQuick: true }))).toBe(true);
  });

  it("fills a new button from the card, or the site's address", () => {
    const me = { phone: '+201000', email: 'm@a.co' };
    const pick = (key: string) => PLATFORMS.find((p) => p.key === key)!;
    expect(initialConfig(pick('WHATSAPP'), me)).toEqual({ phone: '+201000' });
    expect(initialConfig(pick('EMAIL'), me)).toEqual({ email: 'm@a.co' });
    expect(initialConfig(pick('INSTAGRAM'), me)).toEqual({ url: 'https://instagram.com/' });
    expect(initialConfig(pick('SAVE_CONTACT'), me)).toEqual({});
  });

  it('adds https:// to a bare address and leaves other schemes', () => {
    expect(normalizeUrl(' linkedin.com/in/mona ')).toBe('https://linkedin.com/in/mona');
    expect(normalizeUrl('http://a.co')).toBe('http://a.co');
    expect(normalizeUrl('sms:+2010')).toBe('sms:+2010');
    expect(normalizeUrl('')).toBe('');
  });

  it('gives every picker entry a label in both languages and a known kind', () => {
    const keys = new Set<string>();
    for (const p of PLATFORMS) {
      expect(p.en && p.ar).toBeTruthy();
      expect(keys.has(p.key)).toBe(false);
      keys.add(p.key);
    }
  });
});
