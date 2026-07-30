'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Icon } from '@/components/Icon';
import { VMark } from '@/components/brand/VMark';

export type NfcVariant = 'smart-card' | 'metal-card' | 'leather-keychain' | 'sticker';

interface Surface {
  label: string;
  /** CSS background for the product body. */
  background: string;
  /** Overlay texture layered on top of the background. */
  texture?: string;
  foreground: string;
  subtle: string;
  /** aspect ratio (w/h) */
  ratio: number;
  radius: number;
}

function surfaceFor(variant: NfcVariant, accent: string): Surface {
  switch (variant) {
    case 'metal-card':
      return {
        label: 'Metal Card',
        background: 'linear-gradient(135deg, #2b2f36 0%, #4a4f57 40%, #1c1f24 100%)',
        texture:
          'repeating-linear-gradient(115deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 4px)',
        foreground: '#f4f5f7',
        subtle: 'rgba(244,245,247,0.6)',
        ratio: 1.586,
        radius: 16,
      };
    case 'leather-keychain':
      return {
        label: 'Leather Keychain',
        background: 'linear-gradient(135deg, #5a3a26 0%, #7a4f33 45%, #3f2717 100%)',
        texture: 'radial-gradient(rgba(0,0,0,0.18) 1px, transparent 1.4px)',
        foreground: '#f6ede4',
        subtle: 'rgba(246,237,228,0.6)',
        ratio: 0.78,
        radius: 22,
      };
    case 'sticker':
      return {
        label: 'NFC Sticker',
        background: `radial-gradient(circle at 30% 25%, ${accent}, ${accent}cc 55%, ${accent}99 100%)`,
        foreground: '#ffffff',
        subtle: 'rgba(255,255,255,0.75)',
        ratio: 1,
        radius: 9999,
      };
    default:
      return {
        label: 'Smart Card',
        background: `linear-gradient(135deg, ${accent} 0%, ${accent}dd 45%, ${accent}99 100%)`,
        texture: 'linear-gradient(0deg, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
        foreground: '#ffffff',
        subtle: 'rgba(255,255,255,0.72)',
        ratio: 1.586,
        radius: 16,
      };
  }
}

/**
 * Premium 3D-inspired NFC product preview: pointer-driven tilt, ambient glow,
 * floating motion, material texture, and a "tap to activate" pulse animation.
 */
export function NfcProduct({
  variant,
  name,
  org,
  qrUrl,
  accent,
  assigned = true,
}: {
  variant: NfcVariant;
  name: string;
  org: string;
  qrUrl?: string;
  accent: string;
  assigned?: boolean;
}) {
  const s = surfaceFor(variant, accent);
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [tap, setTap] = useState(false);

  const width = 300;
  const height = Math.round(width / s.ratio);

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: -py * 14, y: px * 16 });
  }

  function activate() {
    setTap(true);
    setTimeout(() => setTap(false), 1400);
  }

  return (
    <div className="flex flex-col items-center gap-5" style={{ perspective: 1100 }}>
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.div
          ref={ref}
          onMouseMove={onMove}
          onMouseLeave={() => setTilt({ x: 0, y: 0 })}
          onClick={activate}
          animate={{ rotateX: tilt.x, rotateY: tilt.y }}
          transition={{ type: 'spring', stiffness: 180, damping: 16 }}
          className="relative cursor-pointer select-none"
          style={{ width, height, borderRadius: s.radius, transformStyle: 'preserve-3d' }}
        >
          {/* ambient glow */}
          <div
            aria-hidden
            className="absolute -inset-6 -z-10 blur-2xl"
            style={{ background: accent, opacity: 0.35, borderRadius: s.radius }}
          />
          {/* body */}
          <div className="absolute inset-0 overflow-hidden" style={{ background: s.background, borderRadius: s.radius, boxShadow: '0 30px 60px -20px rgba(0,0,0,0.55)' }}>
            {s.texture && <div className="absolute inset-0" style={{ backgroundImage: s.texture, backgroundSize: variant === 'leather-keychain' ? '6px 6px' : '30px 30px', opacity: 0.7 }} />}
            {/* moving sheen */}
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.28) 48%, transparent 62%)', transform: `translateX(${tilt.y * 3}px)` }}
            />
            {/* content */}
            <div className="relative flex h-full flex-col justify-between p-5" style={{ color: s.foreground }}>
              <div className="flex items-start justify-between">
                <span className="flex items-center gap-1.5 text-[13px] font-black uppercase tracking-wide">
                  <VMark size={16} strokeWidth={2.6} /> Vertex
                </span>
                {qrUrl && variant !== 'sticker' && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrUrl} alt="" className="h-9 w-9 rounded bg-white p-0.5" />
                )}
                {variant === 'sticker' && <Icon name="sparkle" size={18} />}
              </div>

              {variant === 'sticker' ? (
                <div className="text-center">
                  <p className="text-[12px] font-bold uppercase tracking-[0.15em]" style={{ color: s.subtle }}>Tap</p>
                </div>
              ) : (
                <div>
                  <p className="truncate text-[16px] font-extrabold leading-tight">{name}</p>
                  <p className="truncate text-[11px] font-semibold uppercase tracking-wide" style={{ color: s.subtle }}>{org || 'Digital Profile'}</p>
                </div>
              )}

              {/* NFC glyph */}
              <div className="absolute bottom-4 end-5 opacity-80">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={s.foreground} strokeWidth="1.6" strokeLinecap="round">
                  <path d="M5 8a10 10 0 0 1 0 8M9 6.5a14 14 0 0 1 0 11M13 5a18 18 0 0 1 0 14" opacity="0.9" />
                </svg>
              </div>
            </div>

            {/* tap pulse */}
            {tap && (
              <>
                <motion.span
                  className="absolute inset-0"
                  style={{ borderRadius: s.radius, boxShadow: `inset 0 0 0 3px ${accent}` }}
                  initial={{ opacity: 0.9 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 1 }}
                />
                <motion.span
                  className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ border: `2px solid ${s.foreground}` }}
                  initial={{ scale: 0.3, opacity: 0.8 }}
                  animate={{ scale: 3, opacity: 0 }}
                  transition={{ duration: 1.1, ease: 'easeOut' }}
                />
              </>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* status row */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-[11px]">
        <span className="rounded-full border border-line bg-canvas/60 px-2.5 py-1 font-semibold text-muted">{s.label}</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${assigned ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${assigned ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {assigned ? 'Assigned & Active' : 'Unassigned'}
        </span>
        <button onClick={activate} className="v-btn v-btn-ghost h-7 px-2.5 text-[11px] font-semibold">
          <Icon name="sparkle" size={12} /> Simulate Tap
        </button>
      </div>
    </div>
  );
}
