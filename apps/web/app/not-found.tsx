'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';

/**
 * The app-wide 404. It used to claim "Card not found" for every bad URL, which
 * was wrong outside /c/[slug] — cards now have their own not-found page.
 */
export default function NotFound() {
  const { t } = useTranslation('common');

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
        <p className="mt-2 text-muted">{t('notFound.body')}</p>
        <Link href="/dashboard" className="v-btn mt-6 !h-10 px-6 text-[13.5px] font-bold">
          {t('notFound.home')}
        </Link>
      </div>
    </main>
  );
}
