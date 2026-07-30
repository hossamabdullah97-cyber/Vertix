'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/Icon';

export default function ExpandableBio({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const isLong = text.length > 120;

  return (
    <div className="mt-3">
      <motion.p
        initial={false}
        className="text-[14px] leading-relaxed text-[hsl(var(--v-fg))]/90"
        style={!open && isLong ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : undefined}
      >
        {text}
      </motion.p>
      {isLong && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold"
          style={{ color: 'var(--v-accent)' }}
        >
          {open ? 'Show less' : 'Read more'}
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={open ? 'up' : 'down'}
              initial={{ rotate: open ? -180 : 0 }}
              animate={{ rotate: open ? 180 : 0 }}
            >
              <Icon name="chevron-down" size={14} />
            </motion.span>
          </AnimatePresence>
        </button>
      )}
    </div>
  );
}
