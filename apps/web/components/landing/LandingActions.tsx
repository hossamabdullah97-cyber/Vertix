'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { SALES_MAILTO } from '@/lib/contact';
import { DirectionalIcon } from '@/components/i18n/DirectionalIcon';
import { useSignedIn } from './Header';
import { REGISTER } from './shared';

/**
 * The landing page's buttons, which change once we know the visitor is signed
 * in. The only part of the hero and the closing section that needs the
 * browser; the rest renders on the server and ships no script.
 */
export function HeroActions() {
  const { t } = useTranslation('landing');
  const signedIn = useSignedIn();
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {signedIn ? (
        <Link href="/dashboard" className="v-btn !h-11 px-5 text-base">
          {t('nav.dashboard')} <DirectionalIcon name="arrow" size={15} />
        </Link>
      ) : (
        <>
          <Link href={REGISTER} className="v-btn !h-11 px-5 text-base">
            {t('hero.primary')} <DirectionalIcon name="arrow" size={15} />
          </Link>
          <Link href="/login" className="v-btn v-btn-ghost !h-11 px-5 text-base">
            {t('hero.secondary')}
          </Link>
        </>
      )}
    </div>
  );
}

export function ClosingActions() {
  const { t } = useTranslation('landing');
  const signedIn = useSignedIn();
  return (
    <div className="relative flex flex-wrap gap-3">
      <Link href={signedIn ? '/dashboard' : REGISTER} className="v-btn !h-11 px-5 text-base">
        {signedIn ? t('nav.dashboard') : t('cta.primary')}
      </Link>
      <a href={SALES_MAILTO} className="v-btn v-btn-ghost !h-11 px-5 text-base">
        {t('cta.secondary')}
      </a>
    </div>
  );
}
