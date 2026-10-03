import Link from 'next/link';
import { getT, serverLocale } from '@/lib/i18n/server';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { Brand, REGISTER, WRAP } from './shared';

export function Footer() {
  const t = getT(serverLocale(), 'landing');
  const link = 'inline-flex min-h-11 min-w-11 items-center text-sm text-muted sm:min-h-9 sm:min-w-0 transition-colors hover:text-ink';

  return (
    <footer className="border-t border-line">
      <div className={`${WRAP} grid grid-cols-2 gap-10 py-12 sm:grid-cols-[2fr_1fr_1fr_1fr]`}>
        <div className="col-span-2 sm:col-span-1">
          <Brand />
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{t('footer.tagline')}</p>
        </div>
        <nav aria-label={t('footer.product')}>
          <p className="text-xs font-medium text-faint">{t('footer.product')}</p>
          <ul className="mt-2">
            {(['product', 'how', 'pricing', 'faq'] as const).map((k) => (
              <li key={k}>
                <a href={`#${k}`} className={link}>
                  {t(`nav.${k}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t('footer.account')}>
          <p className="text-xs font-medium text-faint">{t('footer.account')}</p>
          <ul className="mt-2">
            <li>
              <Link href="/login" className={link}>
                {t('nav.signIn')}
              </Link>
            </li>
            <li>
              <Link href={REGISTER} className={link}>
                {t('footer.createAccount')}
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label={t('footer.legal')}>
          <p className="text-xs font-medium text-faint">{t('footer.legal')}</p>
          <ul className="mt-2">
            {(['privacy', 'terms', 'refunds', 'contact'] as const).map((k) => (
              <li key={k}>
                <Link href={`/legal/${k}`} className={link}>
                  {t(`footer.legalLinks.${k}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className={`${WRAP} flex items-center justify-between gap-4 border-t border-line py-5`}>
        <p className="text-xs text-faint">{t('footer.rights', { year: new Date().getFullYear() })}</p>
        <LanguageSwitcher />
      </div>
    </footer>
  );
}
