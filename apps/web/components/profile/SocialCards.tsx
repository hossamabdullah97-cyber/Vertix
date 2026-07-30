'use client';

import { motion } from 'framer-motion';
import { resolveAction } from '@/lib/brandIcons';
import { Icon } from '@/components/Icon';
import type { PublicCardAction } from '@/lib/api';

function lighten(hex: string, amt = 34): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const c = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${c(parseInt(m[1], 16) + amt)}${c(parseInt(m[2], 16) + amt)}${c(parseInt(m[3], 16) + amt)}`;
}

/** Branded icon grid — large circle icons with labels, like the reference card design. */
export default function SocialCards({ actions, slug }: { actions: PublicCardAction[]; slug: string }) {
  const links = actions
    .map((a) => ({ a, r: resolveAction(a, slug) }))
    .filter((x): x is { a: PublicCardAction; r: NonNullable<typeof x.r> } => x.r !== null && !x.r.isQuickContact);

  if (links.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-5">
      {links.map(({ a, r }, i) => (
        <motion.a
          key={a.id}
          href={r.href}
          target="_blank"
          rel="noreferrer"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 24 }}
          whileHover={{ y: -3, scale: 1.04 }}
          whileTap={{ scale: 0.95 }}
          className="group flex flex-col items-center gap-2 text-center"
        >
          <span
            className="flex h-[60px] w-[60px] items-center justify-center rounded-2xl text-white shadow-md transition-shadow group-hover:shadow-lg"
            style={{ background: `linear-gradient(145deg, ${lighten(r.brand.color, 20)}, ${r.brand.color})` }}
          >
            <Icon name={r.brand.icon} size={26} />
          </span>
          <span className="text-[12px] font-semibold text-[hsl(var(--v-fg))] leading-tight truncate max-w-full">
            {r.brand.label}
          </span>
        </motion.a>
      ))}
    </div>
  );
}
