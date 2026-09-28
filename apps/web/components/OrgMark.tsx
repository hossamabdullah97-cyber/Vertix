import { readableOn } from '@/lib/color';

/** Fired after the workspace's name or brand changes, so the switcher refreshes. */
export const ORG_UPDATED = 'vertex:org-updated';

/** "Demo Organization" → "DO". */
export function orgInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '•'
  );
}

/**
 * A workspace's mark: its uploaded logo, or its initials on its brand colour.
 * Used wherever a workspace is named (the switcher, settings previews).
 */
export function OrgMark({
  name,
  branding,
  size = 22,
  className = '',
}: {
  name: string;
  branding?: Record<string, unknown> | null;
  size?: number;
  className?: string;
}) {
  const logo = typeof branding?.logo === 'string' && branding.logo ? branding.logo : null;
  const accent = typeof branding?.accent === 'string' && /^#[0-9a-f]{6}$/i.test(branding.accent) ? branding.accent : '#1f2a44';
  const style = { width: size, height: size, borderRadius: Math.round(size * 0.27) };
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" style={style} className={`shrink-0 object-cover ring-1 ring-inset ring-black/10 ${className}`} />;
  }
  return (
    <span
      aria-hidden
      style={{ ...style, background: accent, color: readableOn(accent), fontSize: Math.max(8, Math.round(size * 0.42)) }}
      className={`flex shrink-0 items-center justify-center font-semibold ${className}`}
    >
      {orgInitials(name)}
    </span>
  );
}
