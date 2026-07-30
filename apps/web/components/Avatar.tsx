'use client';

import { useState } from 'react';
import { initials, hueFor } from '@/lib/crm';

/**
 * The verified mark: a scalloped disc with a check, in the accent colour. Sized
 * in px so it can sit on avatars from 24px up to the profile hero.
 */
export function VerifiedBadge({
  size = 16,
  className = '',
  absolute = true,
}: {
  size?: number;
  className?: string;
  /** Pinned to the parent's bottom-end corner; pass false to place it inline. */
  absolute?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label="Verified account"
      className={`${absolute ? 'absolute -bottom-0.5 -end-0.5' : 'inline-block'} shrink-0 ${className}`}
      style={{ filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.18))' }}
    >
      <path
        fill="var(--v-accent)"
        d="M12 1.5l2.35 1.86 2.98-.3 1.2 2.75 2.72 1.27-.62 2.94L22.5 12l-1.87 2.35.3 2.98-2.75 1.2-1.27 2.72-2.94-.62L12 22.5l-2.35-1.87-2.98.3-1.2-2.75-2.72-1.27.62-2.94L1.5 12l1.87-2.35-.3-2.98 2.75-1.2L7.09 2.75l2.94.62L12 1.5z"
      />
      <path
        fill="none"
        stroke="var(--v-accent-contrast)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.8 12.2l2.9 2.9 5.5-6"
      />
    </svg>
  );
}

export interface AvatarUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  /** The user's own account photo — independent of any card artwork. */
  avatarUrl?: string | null;
}

/**
 * A person's account photo, with a deterministic initials tile as the fallback.
 * The hue is derived from the identity, so the same person keeps the same
 * colour everywhere they appear until they upload a photo.
 */
export function Avatar({
  user,
  size = 32,
  className = '',
  ring = false,
  verified = false,
}: {
  user: AvatarUser;
  size?: number;
  className?: string;
  /** Draws a surface-coloured ring — use when overlapping other content. */
  ring?: boolean;
  /** Earned by a paid plan — never pass a self-declared value. */
  verified?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  const label = user.name?.trim() || user.email?.split('@')[0] || '';
  const seed = user.id || user.email || label || 'user';
  const showPhoto = !!user.avatarUrl && !failed;

  const box = {
    width: size,
    height: size,
    ...(ring ? { boxShadow: '0 0 0 2px hsl(var(--v-surface))' } : {}),
  };

  const face = showPhoto ? (
    // Account photos are user-uploaded and served from the API host, so
    // next/image optimisation buys nothing here and would need a remote allowlist.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={user.avatarUrl!}
      alt={label ? `${label}'s profile photo` : 'Profile photo'}
      onError={() => setFailed(true)}
      style={box}
      className={`shrink-0 rounded-full border border-line object-cover ${className}`}
    />
  ) : (
    <span
      aria-hidden={!label}
      title={verified ? undefined : label || undefined}
      style={{
        ...box,
        background: `hsl(${hueFor(seed)} 62% 48%)`,
        fontSize: Math.max(9, Math.round(size * 0.38)),
      }}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold leading-none text-white ${className}`}
    >
      {initials(label || null)}
    </span>
  );

  if (!verified) return face;

  // Scale the badge with the avatar, but keep it legible on small sizes.
  const badge = Math.max(12, Math.round(size * 0.36));
  return (
    <span
      className="relative inline-flex shrink-0"
      title={label ? `${label} — verified` : 'Verified'}
    >
      {face}
      <VerifiedBadge size={badge} />
    </span>
  );
}
