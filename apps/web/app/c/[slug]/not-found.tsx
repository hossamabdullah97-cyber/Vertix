'use client';

import { useTranslation } from 'react-i18next';
import { VMark } from '@/components/brand/VMark';

/**
 * Shown when a public card link resolves to nothing. The audience here is a
 * visitor with no account, so it explains the likely cause instead of offering
 * an app destination they cannot use.
 */
export default function CardNotFound() {
  const { t } = useTranslation('cards');

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="max-w-sm text-center">
        <span
          className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-[14px] text-white shadow-md"
          style={{ background: 'var(--v-gradient-brand)' }}
        >
          <VMark size={22} strokeWidth={3} />
        </span>

        <h1 className="text-[22px] font-extrabold tracking-tight text-ink">{t('notFound.title')}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{t('notFound.body')}</p>
        <p className="mt-4 text-[12.5px] leading-relaxed text-faint">{t('notFound.hint')}</p>
      </div>
    </main>
  );
}
