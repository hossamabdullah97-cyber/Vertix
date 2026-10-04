import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AR_FALLBACK, AR_INVALID, ApiError, apiErrorText, arabicFor } from './apiErrors';

/**
 * Every message the API can refuse with has Arabic in apiErrors.ts. This reads
 * the API's source for them, so a new message fails here until it is added.
 */
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.ts$/.test(name) && !/\.(spec|test)\.ts$/.test(name) ? [path] : [];
  });

/** The text inside each `new …Exception(…)`, brackets and strings balanced. */
function exceptionArgs(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/new \w+Exception\(/g)) {
    let i = m.index! + m[0].length;
    const start = i;
    let depth = 1;
    while (depth && i < src.length) {
      const c = src[i];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
      else if (`'"\``.includes(c)) {
        i++;
        while (src[i] !== c) i += src[i] === '\\' ? 2 : 1;
      }
      i++;
    }
    out.push(src.slice(start, i - 1));
  }
  return out;
}

/** Words for people: has a space or a capitalised word, unlike codes such as 'plan-limit'. */
const isProse = (s: string) => /[A-Za-z]{2}/.test(s) && /\s|[A-Z][a-z]/.test(s);

const api = files('../api/src').map((f) => readFileSync(f, 'utf8'));
const shared = files('../../packages/shared/src').map((f) => readFileSync(f, 'utf8'));

describe('API error messages in Arabic', () => {
  it('has every literal message', () => {
    const missing = new Set<string>();
    for (const src of api) {
      for (const arg of exceptionArgs(src)) {
        // Joined pieces ('a ' + 'b') are checked as their template, below.
        if (/\+\s*$|^\s*\+/m.test(arg)) continue;
        for (const [, text] of arg.matchAll(/'((?:[^'\\]|\\.)*)'/g)) if (isProse(text) && !arabicFor(text)) missing.add(text);
      }
      for (const [, text] of src.matchAll(/const \w+_MESSAGE\s*=\s*'((?:[^'\\]|\\.)*)'/g)) if (!arabicFor(text)) missing.add(text);
    }
    expect([...missing]).toEqual([]);
  });

  it('has every message with a value in it', () => {
    const missing: string[] = [];
    for (const src of api) {
      for (const arg of exceptionArgs(src)) {
        for (const [, tpl] of arg.matchAll(/`([^`]*)`/g)) {
          // A made-up value in each gap: the pattern has to match whatever goes there.
          const sample = tpl.replace(/\$\{[^}]*\}/g, (g) => (g.includes('?') ? '' : /count|conflicting|status|minutes|limit/i.test(g) ? '3' : 'hubspot'));
          if (isProse(sample) && !arabicFor(sample)) missing.push(tpl);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('has every validation message of the shared schemas', () => {
    const missing = new Set<string>();
    for (const src of shared) {
      for (const [, text] of src.matchAll(/(?:message:\s*|\.(?:min|max|regex|refine|email|url|length)\([^'\n]*?)'((?:[^'\\]|\\.)*)'/g)) {
        if (isProse(text) && !arabicFor(text)) missing.add(text);
      }
      for (const [, text] of src.matchAll(/return '((?:[^'\\]|\\.)*)'/g)) if (isProse(text) && !arabicFor(text)) missing.add(text);
    }
    expect([...missing]).toEqual([]);
  });
});

describe('apiErrorText', () => {
  it('leaves English as the API said it', () => {
    expect(apiErrorText('Card not found', [], 'en')).toBe('Card not found');
    expect(apiErrorText('Invalid input', ['Enter a mobile number', 'Required'], 'en')).toBe('Enter a mobile number, Required');
  });

  it('puts known messages in Arabic, values included', () => {
    expect(apiErrorText('Card not found', [], 'ar')).toBe('البطاقة غير موجودة');
    expect(apiErrorText('hubspot is not connected.', [], 'ar')).toBe('hubspot غير متصل.');
    expect(apiErrorText('Too many attempts. Try again in 1 minute.', [], 'ar')).toContain('1');
    // Why Telegram or Teams turned a message away, in their own words inside ours.
    expect(apiErrorText('The bot cannot post in that chat (Forbidden: bot was kicked from the group chat). Add it to the group, or make it an admin of the channel.', [], 'ar')).toBe(
      'لا يستطيع البوت النشر في هذه المحادثة (Forbidden: bot was kicked from the group chat). أضفه إلى المجموعة، أو اجعله مشرفاً في القناة.',
    );
    expect(apiErrorText('Teams refused the message (HTTP 404). Check that the workflow is turned on and the link is copied whole.', [], 'ar')).toContain('HTTP 404');
    expect(apiErrorText('The message did not arrive (No answer in time). Try again in a moment.', [], 'ar')).toMatch(/^لم تصل الرسالة/);
  });

  it('never shows English in Arabic', () => {
    expect(apiErrorText('Something new the web has not heard of', [], 'ar')).toBe(AR_FALLBACK);
    expect(apiErrorText('Invalid input', ['A field message nobody translated'], 'ar')).toBe(AR_INVALID);
    expect(apiErrorText('Invalid input', ['Required', 'Required'], 'ar')).toBe('هذا الحقل مطلوب');
  });

  it('keeps the API words and status on the error for code that reacts to them', () => {
    vi.stubGlobal('document', { documentElement: { lang: 'ar' } });
    const e = new ApiError('Invalid credentials', 401);
    expect(e.message).toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    expect(e.apiMessage).toBe('Invalid credentials');
    expect(e.status).toBe(401);
    vi.unstubAllGlobals();
  });
});
