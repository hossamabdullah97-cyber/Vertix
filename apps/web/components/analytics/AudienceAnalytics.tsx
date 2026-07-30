'use client';

import { useTranslation } from 'react-i18next';
import { NotTracked } from './Shared';

export function AudienceAnalytics() {
  const { t } = useTranslation('analytics');
  return (
    <NotTracked
      title={t('notTracked.audience.title')}
      icon="users"
      reason={t('notTracked.audience.reason')}
      requirement={t('notTracked.audience.requirement')}
    />
  );
}
