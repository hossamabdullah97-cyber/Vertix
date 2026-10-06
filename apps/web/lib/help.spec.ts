import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HELP, HELP_ARTICLES, HELP_CATEGORIES, article, articleCount, fold, searchHelp } from './help';

describe('help articles', () => {
  const slugs = HELP_ARTICLES.map((a) => a.slug);

  it('are written in both languages, each once', () => {
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const lang of ['en', 'ar'] as const) {
      expect(Object.keys(HELP[lang].articles).sort()).toEqual([...slugs].sort());
      for (const s of slugs) {
        const a = HELP[lang].articles[s]!;
        expect(a.title && a.summary && a.body.length, `${lang}/${s}`).toBeTruthy();
        // The button and where it goes come together.
        expect(!!a.action, `${lang}/${s} action`).toBe(!!HELP_ARTICLES.find((m) => m.slug === s)!.href);
      }
    }
  });

  it('give steps the same length in both languages', () => {
    for (const s of slugs) {
      const steps = (lang: 'en' | 'ar') => HELP[lang].articles[s]!.body.map((b) => ('steps' in b ? b.steps.length : 'tip' in b ? 't' : 'p'));
      expect(steps('ar'), s).toEqual(steps('en'));
    }
  });

  it('link only to articles and pages that exist', () => {
    for (const a of HELP_ARTICLES) {
      for (const r of a.related ?? []) expect(slugs, `${a.slug} → ${r}`).toContain(r);
      if (a.href) {
        const path = a.href.split('?')[0]!;
        expect(existsSync(join('app', path, 'page.tsx')), `${a.slug} → ${a.href}`).toBe(true);
      }
    }
  });

  it('put every article in a topic, and every topic has some', () => {
    const ids = HELP_CATEGORIES.map((c) => c.id);
    for (const a of HELP_ARTICLES) expect(ids).toContain(a.category);
    for (const c of ids) expect(HELP_ARTICLES.some((a) => a.category === c), c).toBe(true);
  });
});

describe('searching help', () => {
  it('finds by title first, in either language', () => {
    expect(searchHelp('en', 'import leads')[0]?.slug).toBe('import-leads');
    expect(searchHelp('en', 'chip')[0]?.slug).toBe('nfc-chips');
    expect(searchHelp('ar', 'استيراد')[0]?.slug).toBe('import-leads');
  });

  it('finds Arabic however the letters are written', () => {
    expect(fold('إضافة')).toBe(fold('اضافه'));
    expect(searchHelp('ar', 'اضافة شريحه').map((a) => a.slug)).toContain('nfc-chips');
  });

  it('needs every word, and finds nothing for nothing', () => {
    expect(searchHelp('en', 'import zebra')).toEqual([]);
    expect(searchHelp('en', '  ')).toEqual([]);
    expect(article('en', 'nope')).toBeNull();
  });

  it('counts articles in Arabic plurals', () => {
    expect([1, 2, 3, 11].map((n) => articleCount('ar', n))).toEqual(['مقال واحد', 'مقالان', '3 مقالات', '11 مقالًا']);
    expect(articleCount('en', 1)).toBe('1 article');
  });
});
