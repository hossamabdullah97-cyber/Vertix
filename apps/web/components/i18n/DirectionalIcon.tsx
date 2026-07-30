'use client';

import { useLocale } from './LanguageProvider';
import { Icon } from '@/components/Icon';

/**
 * Renders an icon that flips horizontally in RTL. Use ONLY for direction-bearing
 * glyphs — back/forward, prev/next, chevrons, directional arrows. Never wrap
 * user/settings/bell/QR/NFC/social/payment/brand icons: those keep their
 * orientation in every locale (use <Icon> directly for those).
 */
export function DirectionalIcon({
  name,
  size = 20,
  className = '',
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const { dir } = useLocale();
  return (
    <span className={dir === 'rtl' ? 'inline-flex -scale-x-100' : 'inline-flex'}>
      <Icon name={name} size={size} className={className} />
    </span>
  );
}
