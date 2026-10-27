'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icon';

/**
 * A chart with nothing to draw yet: its outline, faint, so the space reads as
 * a chart waiting for data rather than an empty box, with what to do to fill
 * it.
 */
export function EmptyChart({ message, actions = [] }: { message: string; actions?: { href: string; label: string; icon: string }[] }) {
  return (
    <div className="relative flex h-[232px] items-center justify-center overflow-hidden px-6 text-center">
      <svg aria-hidden className="absolute inset-x-4 inset-y-6 h-[calc(100%-3rem)] w-[calc(100%-2rem)] text-line" preserveAspectRatio="none" viewBox="0 0 100 40">
        {[8, 18, 28].map((y) => (
          <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="currentColor" strokeWidth="0.3" strokeDasharray="1 1.5" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1="0" x2="100" y1="38" y2="38" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="relative max-w-sm">
        <p className="text-sm leading-relaxed text-muted">{message}</p>
        {actions.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {actions.map((a) => (
              <Link key={a.href} href={a.href} className="v-btn v-btn-ghost">
                <Icon name={a.icon} size={14} /> {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
