import type { Card } from '@/lib/client';

/** A card at thumbnail size: its colour, a photo dot and two lines of text. */
export function CardThumb({ card }: { card: Pick<Card, 'theme'> }) {
  const theme = card.theme ?? {};
  const dark = theme.mode === 'dark';
  const accent = typeof theme.accent === 'string' ? theme.accent : '#2563eb';
  return (
    <span
      aria-hidden
      className="relative h-[25px] w-10 shrink-0 overflow-hidden rounded-[4px] ring-1 ring-inset ring-black/10"
      style={{ background: dark ? '#16161a' : accent }}
      dir="ltr"
    >
      <span className="absolute left-[5px] top-[5px] h-[7px] w-[7px] rounded-full bg-white/90" />
      <span className="absolute bottom-[9px] left-[5px] h-[2px] w-[18px] rounded-full bg-white/70" />
      <span className="absolute bottom-[5px] left-[5px] h-[2px] w-[12px] rounded-full bg-white/50" />
    </span>
  );
}
