'use client';

import { useEffect } from 'react';
import { isStaleChunk, reloadForNewRelease, reportError } from '@/lib/report-error';

const TEXT = {
  en: {
    title: 'Something went wrong on this page',
    body: 'We’ve been told about it and will look into it. Try again, and if it keeps happening, reload the page.',
    retry: 'Try again',
    home: 'Go to the home page',
    updating: 'A new version is ready. Loading it…',
  },
  ar: {
    title: 'حدث خطأ في هذه الصفحة',
    body: 'وصلنا بلاغ به وسنتابعه. حاول مرة أخرى، وإن تكرر أعد تحميل الصفحة.',
    retry: 'حاول مرة أخرى',
    home: 'الذهاب إلى الصفحة الرئيسية',
    updating: 'يوجد إصدار جديد. جارٍ تحميله…',
  },
} as const;

/**
 * What a page shows when it fails to render, in place of a blank screen. It
 * carries its own few words in both languages, since the translations (or the
 * whole layout) may be what failed. The error is reported once.
 */
export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const lang = typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const t = TEXT[lang];
  const stale = isStaleChunk(error);

  useEffect(() => {
    // A deploy replaced the page's code: load the new one instead of failing.
    if (stale && reloadForNewRelease()) return;
    reportError(error, 'react');
  }, [error, stale]);

  return (
    <div role="alert" className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="max-w-[440px] text-center">
        <span aria-hidden className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
          </svg>
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink">{stale ? t.updating : t.title}</h1>
        {!stale && <p className="mt-2 text-sm leading-relaxed text-muted">{t.body}</p>}
        {!stale && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={reset} className="v-btn v-btn-primary">
              {t.retry}
            </button>
            <a href="/" className="v-btn v-btn-ghost">
              {t.home}
            </a>
          </div>
        )}
        {error.digest && (
          <p className="mt-6 font-mono text-2xs text-faint" dir="ltr">
            {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
