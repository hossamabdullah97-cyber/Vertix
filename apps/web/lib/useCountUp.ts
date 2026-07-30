'use client';

import { useEffect, useRef, useState } from 'react';

/** Prefers-reduced-motion aware. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Smoothly animates a number from 0 to `target` over `duration` ms using an
 * ease-out curve. Respects reduced-motion (jumps straight to target).
 */
export function useCountUp(target: number, duration = 1400): number {
  const [value, setValue] = useState(0);
  const frame = useRef<number>();
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    start.current = null;
    const tick = (now: number) => {
      if (start.current === null) start.current = now;
      const elapsed = now - start.current;
      const p = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setValue(Math.round(target * eased));
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, duration]);

  return value;
}
