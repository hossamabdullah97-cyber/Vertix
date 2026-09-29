import { describe, expect, it } from 'vitest';
import { buildProfile, embedUrl, externalUrl, initials, layoutOf, linkStyleOf, modeOf, pick, profileAttrs } from './profile';

const base = { slug: 's', sections: [], actions: [], paymentLinks: [] };

describe('buildProfile', () => {
  it('reads identity from vcardData first, the bio second', () => {
    const p = buildProfile({
      ...base,
      theme: null,
      vcardData: { fullName: 'Mariam', org: 'Sales Director' },
      sections: [{ id: 'b', type: 'BIO', content: { title: 'Old name', body: 'Hello' } }],
    });
    expect(p.name).toBe('Mariam');
    expect(p.title).toBe('Sales Director');
    expect(p.about).toBe('Hello');
    expect(p.sections).toEqual([]);
  });

  it('falls back to safe theme defaults', () => {
    const p = buildProfile({ ...base, theme: { accent: 'red', mode: 'dark', lang: 'fr' }, vcardData: null, fallbackName: 'Your name' });
    expect(p.accent).toBe('#2563eb');
    expect(p.mode).toBe('dark');
    expect(p.coverStyle).toBe('constellation');
    expect(p.lang).toBe('en');
    expect(p.name).toBe('Your name');
  });

  it('orders links by their position', () => {
    const p = buildProfile({
      ...base,
      theme: null,
      vcardData: null,
      actions: [
        { id: 'b', type: 'EMAIL', order: 2, config: {} },
        { id: 'a', type: 'CALL', order: 1, config: {} },
      ],
    });
    expect(p.actions.map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('embedUrl', () => {
  it('turns YouTube and Vimeo links into players', () => {
    expect(embedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(embedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(embedUrl('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871');
    expect(embedUrl('https://example.com/video')).toBeNull();
  });
});

describe('externalUrl and pick', () => {
  it('adds https only when a scheme is missing', () => {
    expect(externalUrl('calendly.com/me')).toBe('https://calendly.com/me');
    expect(externalUrl('https://cal.com/me')).toBe('https://cal.com/me');
  });

  it('skips blank values', () => {
    expect(pick({ a: '  ', b: 'x' }, 'a', 'b')).toBe('x');
    expect(pick(null, 'a')).toBe('');
  });
});

describe('link layout', () => {
  it('reads the layout the owner chose, and lists links by default', () => {
    expect(buildProfile({ ...base, theme: { links: 'icons' }, vcardData: null }).linkStyle).toBe('icons');
    expect(buildProfile({ ...base, theme: { links: 'buttons' }, vcardData: null }).linkStyle).toBe('buttons');
    expect(buildProfile({ ...base, theme: null, vcardData: null }).linkStyle).toBe('list');
  });

  it('treats anything unknown as a list', () => {
    expect(linkStyleOf('grid')).toBe('list');
    expect(linkStyleOf(3)).toBe('list');
  });
});

describe('open in app', () => {
  it('is on only when the owner switched it on', () => {
    expect(buildProfile({ ...base, theme: { openInApp: true }, vcardData: null }).openInApp).toBe(true);
    expect(buildProfile({ ...base, theme: { openInApp: 'yes' }, vcardData: null }).openInApp).toBe(false);
    expect(buildProfile({ ...base, theme: null, vcardData: null }).openInApp).toBe(false);
  });
});

describe('identity fields', () => {
  it('keeps the job title and the company apart', () => {
    const p = buildProfile({ ...base, theme: null, vcardData: { fullName: 'M', title: 'Sales Director', company: 'Vertex Build' } });
    expect(p.title).toBe('Sales Director');
    expect(p.company).toBe('Vertex Build');
  });

  it('shows the workspace unless the owner turned it off', () => {
    const brand = { name: 'Vertex Build', logo: null };
    expect(buildProfile({ ...base, theme: null, vcardData: null, brand }).brand).toEqual(brand);
    expect(buildProfile({ ...base, theme: { brand: false }, vcardData: null, brand }).brand).toBeNull();
  });
});

describe('layout, mode and cover', () => {
  it('reads known values and falls back for the rest', () => {
    expect(layoutOf('spotlight')).toBe('spotlight');
    expect(layoutOf('grid')).toBe('classic');
    expect(modeOf('auto')).toBe('auto');
    expect(modeOf('sepia')).toBe('light');
    expect(buildProfile({ ...base, theme: { cover: 'mesh' }, vcardData: null }).coverStyle).toBe('mesh');
    expect(buildProfile({ ...base, theme: { cover: 'stripes' }, vcardData: null }).coverStyle).toBe('gradient');
  });

  it('marks an auto card for the stylesheet', () => {
    expect(profileAttrs({ mode: 'auto' })).toEqual({ 'data-p-auto': '' });
    expect(profileAttrs({ mode: 'dark' })).toEqual({});
  });
});

describe('initials', () => {
  it('takes the first and last names', () => {
    expect(initials('Mariam Khaled')).toBe('MK');
    expect(initials('mariam el sayed')).toBe('MS');
    expect(initials('Cher')).toBe('C');
    expect(initials('  ')).toBe('•');
  });

  it('gives one letter for an Arabic name, so it does not join into a word', () => {
    expect(initials('حسام عبدالله')).toBe('ح');
  });
});
