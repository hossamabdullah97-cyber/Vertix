/**
 * "r g b" channels for a #rrggbb colour — the form `--v-accent-ch` takes so
 * Tailwind's accent opacity modifiers follow a per-card accent. Anything that
 * is not a six-digit hex falls back to the house blue.
 */
export function hexChannels(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return '37 99 235';
  return [m[1], m[2], m[3]].map((h) => parseInt(h, 16)).join(' ');
}

/** Lighten (positive) or darken (negative) each channel of a #rrggbb colour. */
export function shade(hex: string, amt: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const c = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${c(parseInt(m[1], 16) + amt)}${c(parseInt(m[2], 16) + amt)}${c(parseInt(m[3], 16) + amt)}`;
}

/** Near-black or white, whichever reads on the given background. */
export function readableOn(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const L = [1, 2, 3].map((i) => {
    const c = parseInt(m[i], 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2] > 0.6 ? '#141414' : '#ffffff';
}
