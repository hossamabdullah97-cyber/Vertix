'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { paymentBrand } from '@/lib/paymentBrands';

/**
 * Renders the official logo of a payment platform from /public/brands.
 *
 * The logo sits on a white tile so brand colors read correctly in both light
 * and dark mode. If the official asset is missing (or fails to load) we fall
 * back to a brand-colored tile with a generic icon — the layout never breaks,
 * and dropping the real file in makes the logo appear automatically.
 */
export function PaymentBrandLogo({
  platform,
  size = 44,
}: {
  platform: string;
  size?: number;
}) {
  const brand = paymentBrand(platform);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const radius = Math.round(size * 0.27);

  // The error may fire before React attaches onError during hydration, so also
  // check on mount whether the image already finished loading with no pixels.
  useEffect(() => {
    setFailed(false);
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [platform]);

  if (brand.logo && !failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center overflow-hidden border border-black/5 bg-white shadow-sm"
        style={{ width: size, height: size, borderRadius: radius }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={brand.logo}
          alt={`${brand.label} logo`}
          onError={() => setFailed(true)}
          onLoad={(e) => {
            if (e.currentTarget.naturalWidth === 0) setFailed(true);
          }}
          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: Math.round(size * 0.16) }}
        />
      </span>
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center text-white shadow-sm"
      style={{ width: size, height: size, borderRadius: radius, background: brand.color }}
    >
      <Icon name={brand.icon} size={Math.round(size * 0.45)} />
    </span>
  );
}
