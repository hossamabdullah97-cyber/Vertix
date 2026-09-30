'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Field checks that run as people type, with the same rules the API applies
 * (so a form never passes here and fails there). Each check gives a code,
 * not words: a form turns it into text in its own language, since the
 * public card speaks the card's language and the app speaks the user's.
 */
export type Problem = 'required' | 'email' | 'phone' | 'url' | 'short' | 'oneOf';

// zod's own email pattern, which the API validates with.
const EMAIL = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;
// The API's mobile rule: digits and spaces, 8–16 long, an optional leading +.
const PHONE = /^\+?[0-9 ]{8,16}$/;
const HTTPS_URL = /^https?:\/\/[^\s/$.?#][^\s]*$/i;

export const isEmail = (v: string) => EMAIL.test(v.trim());
export const isPhone = (v: string) => PHONE.test(v.trim());
export const isUrl = (v: string) => HTTPS_URL.test(v.trim());

type Rule = { required?: boolean; kind?: 'email' | 'phone' | 'url'; min?: number };

/** The problem with one value under one rule, or null. */
export function problemOf(value: string, rule: Rule): Problem | null {
  const v = value.trim();
  if (!v) return rule.required ? 'required' : null;
  if (rule.kind === 'email' && !isEmail(v)) return 'email';
  if (rule.kind === 'phone' && !isPhone(v)) return 'phone';
  if (rule.kind === 'url' && !isUrl(v)) return 'url';
  if (rule.min && v.length < rule.min) return 'short';
  return null;
}

/**
 * Which problems to show. A field's problem shows once it has been left
 * (blur) or the form was sent, and goes as soon as the value is right, while
 * typing. `check` on send reports whether all is well and moves focus to the
 * first field with a problem.
 */
export function useChecks<K extends string>(problems: Record<K, Problem | null>) {
  const [touched, setTouched] = useState<Partial<Record<K, boolean>>>({});
  const [sent, setSent] = useState(false);
  const refs = useRef<Partial<Record<K, HTMLElement | null>>>({});

  const shown = (key: K): Problem | null => (sent || touched[key] ? problems[key] : null);

  const check = useCallback(() => {
    setSent(true);
    const first = (Object.keys(problems) as K[]).find((k) => problems[k]);
    if (first) refs.current[first]?.focus();
    return !first;
  }, [problems]);

  /** Spread on the input: tracks leaving it, marks it invalid, and lets `check` focus it. */
  const bind = (key: K, describedBy?: string) => {
    const bad = !!shown(key);
    return {
      ref: (el: HTMLElement | null) => {
        refs.current[key] = el;
      },
      onBlur: () => setTouched((t) => (t[key] ? t : { ...t, [key]: true })),
      'aria-invalid': bad || undefined,
      ...(bad && describedBy ? { 'aria-describedby': describedBy } : {}),
    };
  };

  const reset = useCallback(() => {
    setTouched({});
    setSent(false);
  }, []);

  return { shown, check, bind, reset };
}
