'use client';

import { useTranslation } from 'react-i18next';
import { useLocale } from './LanguageProvider';
import { LOCALES, LOCALE_LABELS } from '@/lib/i18n/config';
import { Icon } from '@/components/Icon';

/**
 * Global language switcher. Switching applies instantly (no reload, no logout,
 * route + form state preserved). Two variants: a compact toggle for headers and
 * a labelled segmented control for settings.
 */
export function LanguageSwitcher({ variant = 'toggle' }: { variant?: 'toggle' | 'segmented' }) {
  const { locale, setLocale, toggleLocale } = useLocale();
  const { t } = useTranslation('common');

  if (variant === 'segmented') {
    return (
      <div
        role="radiogroup"
        aria-label={t('language')}
        className="inline-flex rounded-xl border border-line bg-canvas/40 p-1"
      >
        {LOCALES.map((code) => (
          <button
            key={code}
            role="radio"
            aria-checked={locale === code}
            onClick={() => setLocale(code)}
            className={`rounded-lg px-4 py-1.5 text-[13px] font-bold transition-colors ${
              locale === code ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            {LOCALE_LABELS[code]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={toggleLocale}
      title={t('toggleLanguage')}
      aria-label={t('toggleLanguage')}
      className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] font-bold text-muted transition-colors hover:text-ink"
    >
      <Icon name="globe" size={15} />
      {LOCALE_LABELS[locale === 'ar' ? 'en' : 'ar']}
    </button>
  );
}
