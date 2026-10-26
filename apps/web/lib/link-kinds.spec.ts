import { describe, expect, it } from 'vitest';
import { configFor, detectLink, inputOf, isQuickAction, isUnfinished, kindByKey, kindOf, summaryOf, valueOf, valueProblem } from './link-kinds';

const kind = (key: string) => kindByKey(key)!;

describe('configFor', () => {
  it('puts a username after the site address, without a leading @', () => {
    expect(configFor(kind('INSTAGRAM'), '@mariam.k')).toEqual({ url: 'https://instagram.com/mariam.k' });
    expect(configFor(kind('TIKTOK'), 'mariam')).toEqual({ url: 'https://tiktok.com/@mariam' });
    expect(configFor(kind('LINKEDIN'), 'mariam-khaled')).toEqual({ url: 'https://linkedin.com/in/mariam-khaled' });
    // A dot does not make a username a website.
    expect(configFor(kind('INSTAGRAM'), 'mariam.k')).toEqual({ url: 'https://instagram.com/mariam.k' });
  });

  it('keeps a whole link pasted instead of a username', () => {
    expect(configFor(kind('INSTAGRAM'), 'https://www.instagram.com/mariam.k/')).toEqual({ url: 'https://www.instagram.com/mariam.k/' });
    expect(configFor(kind('FACEBOOK'), 'facebook.com/vertex')).toEqual({ url: 'https://facebook.com/vertex' });
  });

  it('keeps numbers, addresses and places where the card reads them', () => {
    expect(configFor(kind('WHATSAPP'), ' +20 100 555 0142 ')).toEqual({ phone: '+20 100 555 0142' });
    expect(configFor(kind('EMAIL'), 'a@b.co')).toEqual({ email: 'a@b.co' });
    expect(configFor(kind('SMS'), '+20 100 555')).toEqual({ url: 'sms:+20100555' });
    expect(configFor(kind('MAPS'), 'Tahrir Square, Cairo')).toEqual({ query: 'Tahrir Square, Cairo' });
    expect(configFor(kind('MAPS'), 'maps.app.goo.gl/abc')).toEqual({ url: 'https://maps.app.goo.gl/abc' });
    expect(configFor(kind('WEBSITE'), 'vertex.example')).toEqual({ url: 'https://vertex.example' });
    expect(configFor(kind('SAVE_CONTACT'), '')).toEqual({});
  });
});

describe('valueOf', () => {
  it('reads back what was typed, a username alone on its own site', () => {
    expect(valueOf(kind('INSTAGRAM'), { url: 'https://instagram.com/mariam.k' })).toBe('mariam.k');
    expect(valueOf(kind('INSTAGRAM'), { url: 'https://www.instagram.com/mariam.k' })).toBe('mariam.k');
    expect(valueOf(kind('INSTAGRAM'), { url: 'https://instagr.am/x' })).toBe('https://instagr.am/x');
    expect(valueOf(kind('SMS'), { url: 'sms:+2010' })).toBe('+2010');
    expect(valueOf(kind('MAPS'), { query: 'Cairo' })).toBe('Cairo');
    expect(valueOf(kind('CALL'), { phone: '+2010' })).toBe('+2010');
  });

  it('round-trips with configFor', () => {
    for (const [key, v] of [['TIKTOK', 'mariam'], ['INSTAGRAM', 'mariam.k'], ['TELEGRAM', 'vertex'], ['WEBSITE', 'https://a.example'], ['EMAIL', 'x@y.zz']] as const) {
      expect(valueOf(kind(key), configFor(kind(key), v))).toBe(v);
    }
  });
});

describe('kindOf', () => {
  it('names a website button after the site it goes to', () => {
    expect(kindOf({ type: 'WEBSITE', config: { url: 'https://instagram.com/x' } }).key).toBe('INSTAGRAM');
    expect(kindOf({ type: 'WEBSITE', config: { url: 'https://x.com/x' } }).key).toBe('TWITTER');
    expect(kindOf({ type: 'WEBSITE', config: { url: 'https://box.com/x' } }).key).toBe('WEBSITE');
    expect(kindOf({ type: 'BOOK_MEETING', config: { url: 'https://calendly.com/x' } }).key).toBe('CALENDLY');
    expect(kindOf({ type: 'WHATSAPP', config: {} }).key).toBe('WHATSAPP');
    expect(kindOf({ type: 'FILE', config: {} }).key).toBe('DOWNLOAD');
  });
});

describe('what a kind asks for', () => {
  it('asks for a number, an address, a username or a link', () => {
    expect(inputOf(kind('CALL'))).toBe('phone');
    expect(inputOf(kind('EMAIL'))).toBe('email');
    expect(inputOf(kind('INSTAGRAM'))).toBe('handle');
    expect(inputOf(kind('WEBSITE'))).toBe('url');
    expect(inputOf(kind('MAPS'))).toBe('place');
    expect(inputOf(kind('SAVE_CONTACT'))).toBe('none');
  });

  it('refuses what cannot work', () => {
    expect(valueProblem(kind('CALL'), '')).toBe('required');
    expect(valueProblem(kind('CALL'), '123')).toBe('phone');
    expect(valueProblem(kind('CALL'), '+20 100 555 0142')).toBeNull();
    expect(valueProblem(kind('EMAIL'), 'nope')).toBe('email');
    expect(valueProblem(kind('WEBSITE'), 'not a link')).toBe('url');
    expect(valueProblem(kind('WEBSITE'), 'vertex.example')).toBeNull();
    expect(valueProblem(kind('INSTAGRAM'), 'mariam k')).toBe('url');
    expect(valueProblem(kind('SAVE_CONTACT'), '')).toBeNull();
  });
});

describe('a button on the card', () => {
  it('sits in the round buttons when it is a way to reach someone, unless moved', () => {
    expect(isQuickAction({ type: 'CALL', config: {} })).toBe(true);
    expect(isQuickAction({ type: 'CALL', config: { isQuick: false } })).toBe(false);
    expect(isQuickAction({ type: 'WEBSITE', config: { isQuick: true } })).toBe(true);
    expect(isQuickAction({ type: 'WEBSITE', config: {} })).toBe(false);
  });

  it('reads as unfinished when it goes nowhere', () => {
    expect(isUnfinished({ type: 'WEBSITE', config: { url: '' } })).toBe(true);
    expect(isUnfinished({ type: 'SAVE_CONTACT', config: {} })).toBe(false);
    expect(summaryOf({ type: 'WEBSITE', config: { url: 'https://www.vertex.example/' } })).toBe('vertex.example');
  });
});

describe('detectLink', () => {
  const key = (raw: string) => {
    const d = detectLink(raw);
    return d && 'kind' in d ? [d.kind.key, d.value] : d;
  };
  it('names a link after its site, keeping only the username where it can', () => {
    expect(key('https://www.instagram.com/mariam.k')).toEqual(['INSTAGRAM', 'mariam.k']);
    expect(key('instagram.com/mariam.k')).toEqual(['INSTAGRAM', 'mariam.k']);
    expect(key('linkedin.com/in/mariam-khaled')).toEqual(['LINKEDIN', 'mariam-khaled']);
    expect(key('https://tiktok.com/@mariam')).toEqual(['TIKTOK', 'mariam']);
    expect(key('vertex.example')).toEqual(['WEBSITE', 'https://vertex.example']);
    expect(key('https://maps.app.goo.gl/abc')).toEqual(['MAPS', 'https://maps.app.goo.gl/abc']);
    expect(key('https://calendly.com/mariam/30min')).toEqual(['CALENDLY', 'mariam/30min']);
    // …and that value goes back to the same address.
    expect(configFor(kind('CALENDLY'), 'mariam/30min')).toEqual({ url: 'https://calendly.com/mariam/30min' });
  });
  it('reads a WhatsApp chat link as its number', () => {
    expect(key('https://wa.me/201005550142')).toEqual(['WHATSAPP', '+201005550142']);
  });
  it('knows an email and a phone number', () => {
    expect(key('mariam@vertex.example')).toEqual(['EMAIL', 'mariam@vertex.example']);
    expect(detectLink('+20 100 555 0142')).toEqual({ phone: '+20 100 555 0142' });
    expect(detectLink('01005550142')).toEqual({ phone: '01005550142' });
  });
  it('gives up on what is none of these', () => {
    expect(detectLink('')).toBeNull();
    expect(detectLink('hello there')).toBeNull();
    expect(detectLink('12345')).toBeNull();
  });
});
