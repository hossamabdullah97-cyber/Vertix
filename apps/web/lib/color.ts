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
