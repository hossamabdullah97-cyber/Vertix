import { describe, expect, it } from 'vitest';
import { handleOf, resolveAction } from './brandIcons';

describe('handleOf', () => {
  it('shows a social profile as its handle', () => {
    expect(handleOf('https://www.instagram.com/mona.hassan/')).toBe('@mona.hassan');
    expect(handleOf('instagram.com/mona.hassan?igsh=abc')).toBe('@mona.hassan');
    expect(handleOf('https://x.com/vertex')).toBe('@vertex');
    expect(handleOf('https://www.tiktok.com/@mona')).toBe('@mona');
    expect(handleOf('https://www.linkedin.com/in/hossam-abdullah')).toBe('@hossam-abdullah');
    expect(handleOf('https://linkedin.com/company/vertex-leather/')).toBe('@vertex-leather');
    expect(handleOf('https://m.facebook.com/vertexleather')).toBe('@vertexleather');
    expect(handleOf('https://youtube.com/@vertex')).toBe('@vertex');
    expect(handleOf('https://t.me/mona')).toBe('@mona');
  });

  it('falls back to the address when there is no handle in it', () => {
    expect(handleOf('https://www.facebook.com/profile.php?id=1000')).toBe('facebook.com/profile.php');
    expect(handleOf('https://www.facebook.com/share/abc123')).toBe('facebook.com/share/abc123');
  });

  it('gives a website its domain and a short path', () => {
    expect(handleOf('https://www.vertexleatherco.com/')).toBe('vertexleatherco.com');
    expect(handleOf('https://vertexleatherco.com/shop')).toBe('vertexleatherco.com/shop');
    expect(handleOf('https://vertexleatherco.com/a/very/long/path/that/goes/on')).toBe('vertexleatherco.com');
  });

  it('says nothing for a map, whose name already says it', () => {
    expect(handleOf('https://maps.app.goo.gl/xyz')).toBe('');
    expect(handleOf('https://www.google.com/maps/place/Giza')).toBe('');
  });

  it('leaves what is not a web address alone', () => {
    expect(handleOf('+20 100 000 0000')).toBe('+20 100 000 0000');
    expect(handleOf('mailto:a@b.co')).toBe('mailto:a@b.co');
  });
});

describe('resolveAction', () => {
  it('names a link by its network and shows the handle under it', () => {
    const r = resolveAction({ id: 'a', type: 'WEBSITE', label: null, config: { url: 'https://instagram.com/mona' } } as never, 'mona');
    expect(r?.brand.label).toBe('Instagram');
    expect(r?.subtitle).toBe('@mona');
  });
});
