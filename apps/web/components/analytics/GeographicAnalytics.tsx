'use client';

import { useTranslation } from 'react-i18next';
import { NotTracked } from './Shared';

export function GeographicAnalytics() {
  const { t } = useTranslation('analytics');
  return (
    <NotTracked
      title={t('notTracked.geography.title')}
      icon="map"
      reason={t('notTracked.geography.reason')}
      requirement={t('notTracked.geography.requirement')}
    />
  );
}
