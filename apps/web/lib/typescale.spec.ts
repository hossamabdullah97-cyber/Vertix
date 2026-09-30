import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Text sizes come from the type scale in tailwind.config.ts (text-3xs … text-5xl,
 * 10–32px). A literal size in that range (text-[13.5px]) is how 31 sizes crept
 * in before; only badges inside fixed circles (under 10px) and display
 * headings (over 32px) may still be literal.
 */
const ROOTS = ['app', 'components', 'design-system', 'lib'];
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) && !/\.spec\.tsx?$/.test(name) ? [path] : [];
  });

describe('type scale', () => {
  it('has no literal text sizes where the scale has a step', () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap(files)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/(?<![\w-])text-\[([0-9.]+)px\]/g)) {
        const px = Number(m[1]);
        if (px >= 10 && px <= 32) offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
