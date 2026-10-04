import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Arabic has six plural forms. A string given only some of them shows its raw
 * key for the counts it lacks (2 contacts, 3 contacts…), so each plural in
 * the Arabic files has all six.
 */
describe('Arabic plurals', () => {
  it('give every form', () => {
    const missing: string[] = [];
    const walk = (node: Record<string, unknown>, path: string[]) => {
      const keys = Object.keys(node);
      for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') walk(v as Record<string, unknown>, [...path, k]);
      const bases = new Set(keys.filter((k) => /_(one|other)$/.test(k)).map((k) => k.replace(/_(one|other)$/, '')));
      for (const b of bases)
        for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) if (!keys.includes(`${b}_${form}`)) missing.push(`${[...path, b].join('.')}_${form}`);
    };
    const dir = 'locales/ar';
    for (const f of readdirSync(dir)) walk(JSON.parse(readFileSync(join(dir, f), 'utf8')), [f.replace('.json', '')]);
    expect(missing).toEqual([]);
  });
});
