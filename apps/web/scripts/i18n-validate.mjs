#!/usr/bin/env node
/**
 * i18n translation validator (spec §23).
 *
 * Compares every locale against the reference locale (en) and reports:
 *   - missing keys       (present in en, absent elsewhere)
 *   - extra keys         (present elsewhere, absent in en)
 *   - interpolation drift (mismatched {{vars}} between locales)
 *   - empty values
 *
 * Exit code 1 on any missing key or interpolation drift so CI can gate on it.
 * Run: node apps/web/scripts/i18n-validate.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, '..', 'locales');
const REFERENCE = 'en';

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function load(locale) {
  const dir = join(LOCALES_DIR, locale);
  const merged = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const ns = file.replace(/\.json$/, '');
    const json = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    merged[ns] = flatten(json);
  }
  return merged;
}

function vars(value) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map((m) => m[1]).sort();
}

const locales = readdirSync(LOCALES_DIR).filter((f) => !f.includes('.'));
const ref = load(REFERENCE);
let missing = 0;
let drift = 0;
let empty = 0;
const lines = [];

for (const locale of locales) {
  if (locale === REFERENCE) continue;
  const target = load(locale);
  for (const ns of Object.keys(ref)) {
    const refKeys = ref[ns] ?? {};
    const tgtKeys = target[ns] ?? {};
    for (const key of Object.keys(refKeys)) {
      const full = `${ns}:${key}`;
      if (!(key in tgtKeys)) {
        lines.push(`  ✗ [${locale}] MISSING  ${full}`);
        missing++;
        continue;
      }
      if (typeof tgtKeys[key] === 'string' && tgtKeys[key].trim() === '') {
        lines.push(`  ! [${locale}] EMPTY    ${full}`);
        empty++;
      }
      const rv = vars(refKeys[key]).join(',');
      const tv = vars(tgtKeys[key]).join(',');
      if (rv !== tv) {
        lines.push(`  ✗ [${locale}] VARS     ${full}  en:{${rv}} ${locale}:{${tv}}`);
        drift++;
      }
    }
    for (const key of Object.keys(tgtKeys)) {
      if (!(key in refKeys)) lines.push(`  · [${locale}] EXTRA    ${ns}:${key}`);
    }
  }
}

console.log(`\ni18n validation — reference: ${REFERENCE}, locales: ${locales.join(', ')}`);
console.log(lines.length ? lines.join('\n') : '  ✓ all locales in sync');
console.log(`\nmissing: ${missing}  interpolation-drift: ${drift}  empty: ${empty}\n`);

process.exit(missing > 0 || drift > 0 ? 1 : 0);
