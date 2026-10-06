import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../locales/en/teams.json';
import ar from '../locales/ar/teams.json';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });

// Every action the API writes to the activity log, as the workspace's activity
// view, the dashboard and the admin log read it ("member.joined" → member_joined).
const actions = new Set<string>();
for (const f of files(join(__dirname, '../../api/src'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:audit(?:\.log)?\((?:\{[^}]*\}|[^,()]+),\s*|action:\s*)(?:[^'"`]*\?\s*)?'([a-z_]+\.[a-z_.]+)'(?:\s*:\s*'([a-z_]+\.[a-z_.]+)')?/g)) {
    actions.add(m[1]!);
    if (m[2]) actions.add(m[2]);
  }
}

describe('activity log', () => {
  it('finds the actions the API records', () => {
    expect(actions.size).toBeGreaterThan(30);
    expect(actions).toContain('sso.tested');
  });

  for (const [lang, msgs] of [['en', en], ['ar', ar]] as const) {
    it(`describes every action in ${lang}, never showing its code`, () => {
      const labels = msgs.activity.actions as Record<string, string>;
      expect([...actions].filter((a) => !labels[a.replace('.', '_')])).toEqual([]);
    });
  }
});
