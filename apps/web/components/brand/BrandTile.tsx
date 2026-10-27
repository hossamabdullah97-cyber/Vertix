import { iconPath } from '@/components/Icon';
import { readableOn } from '@/lib/color';

/**
 * Marks drawn solid, as the networks draw them, rather than as outlines; the
 * rule says how a mark with a hole in it (YouTube's play, a map pin) is filled.
 * The rest (Instagram, WhatsApp, mail, a globe) are line drawings in their
 * own right and stay stroked.
 */
const SOLID: Record<string, 'nonzero' | 'evenodd'> = {
  facebook: 'nonzero',
  linkedin: 'nonzero',
  twitter: 'nonzero',
  telegram: 'nonzero',
  tiktok: 'nonzero',
  snapchat: 'nonzero',
  phone: 'nonzero',
  youtube: 'evenodd',
  'map-pin': 'evenodd',
};

/** Instagram's own gradient; every other network is one colour. */
const INSTAGRAM = 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285aeb 90%)';

export function BrandGlyph({ icon, size }: { icon: string; size: number }) {
  const rule = SOLID[icon];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={rule ? 'currentColor' : 'none'}
      fillRule={rule}
      stroke={rule ? 'none' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPath(icon)} />
    </svg>
  );
}

/**
 * A link's network as an app icon: the brand's colour with its mark in white
 * (or near-black on a light brand such as Snapchat's yellow). A hairline keeps
 * a black mark (X, TikTok) apart from a dark card.
 */
export function BrandTile({ icon, color, size, radius }: { icon: string; color: string; size: number; radius: number }) {
  const instagram = icon === 'instagram';
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: instagram ? INSTAGRAM : color,
        color: instagram ? '#ffffff' : readableOn(color),
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14), 0 1px 2px rgba(16,24,40,0.10)',
      }}
    >
      <BrandGlyph icon={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}
