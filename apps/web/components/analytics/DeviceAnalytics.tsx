'use client';

import { useTranslation } from 'react-i18next';
import { NotTracked } from './Shared';

export function DeviceAnalytics() {
  const { t } = useTranslation('analytics');
  return (
    <NotTracked
      title={t('notTracked.devices.title')}
      icon="list"
      reason={t('notTracked.devices.reason')}
      requirement={t('notTracked.devices.requirement')}
    />
  );
}
