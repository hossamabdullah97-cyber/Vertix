'use client';

import { useTranslation } from 'react-i18next';
import { NotTracked } from './Shared';

export function QrAnalytics() {
  const { t } = useTranslation('analytics');
  return (
    <NotTracked
      title={t('notTracked.qr.title')}
      icon="grid"
      reason={t('notTracked.qr.reason')}
      requirement={t('notTracked.qr.requirement')}
    />
  );
}
