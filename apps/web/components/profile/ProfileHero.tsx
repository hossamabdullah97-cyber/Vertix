'use client';

import { motion } from 'framer-motion';
import { Constellation } from '@/components/profile/Constellation';
import { VMark } from '@/components/brand/VMark';
import { Icon } from '@/components/Icon';
import { VerifiedBadge } from '@/components/Avatar';
import { profileStrings, type Lang } from '@/lib/profileI18n';

function shade(hex: string, amt: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const c = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${c(parseInt(m[1], 16) + amt)}${c(parseInt(m[2], 16) + amt)}${c(parseInt(m[3], 16) + amt)}`;
}

export interface HeroProps {
  name: string;
  title: string;
  company: string;
  avatar: string;
  accent: string;
  contrast: string;
  coverImage: string;
  coverStyle: 'constellation' | 'gradient' | 'solid';
  circle: boolean;
  verified: boolean;
  available: string;
  location: string;
  languages: string;
  responseTime: string;
  lang: Lang;
}

export default function ProfileHero(p: HeroProps) {
  const t = profileStrings(p.lang);
  const ringShape = p.circle ? 'rounded-full' : 'rounded-[20px]';

  const chips: { icon: string; label: string; dot?: string }[] = [];
  if (p.available) chips.push({ icon: '', label: p.available, dot: '#22c55e' });
  if (p.location) chips.push({ icon: 'map-pin', label: p.location });
  if (p.languages) chips.push({ icon: 'globe', label: p.languages });
  if (p.responseTime) chips.push({ icon: 'clock', label: `${t.respondsIn} ${p.responseTime}` });

  return (
    <div>
      {/* Cover */}
      <div className="relative h-44 sm:h-48">
        {p.coverImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.coverImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.35))' }} />
          </>
        ) : p.coverStyle === 'constellation' ? (
          <div className="absolute inset-0" style={{ background: '#0b0b0e' }}>
            <Constellation className="absolute inset-0 h-full w-full" />
            <div className="absolute inset-0" style={{ background: `radial-gradient(70% 90% at 30% 10%, ${p.accent}33, transparent 70%)` }} />
          </div>
        ) : p.coverStyle === 'solid' ? (
          <div className="absolute inset-0" style={{ background: p.accent }} />
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${p.accent}, ${shade(p.accent, -52)})` }} />
            <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'linear-gradient(0deg, rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
            <div className="pointer-events-none absolute -bottom-4 end-5 text-white/12"><VMark size={168} strokeWidth={1.1} /></div>
          </>
        )}
      </div>

      {/* Avatar — centered, overlapping cover */}
      <div className="flex flex-col items-center -mt-16 relative z-10 px-5 sm:px-7">
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className="relative mb-3"
        >
          {p.circle && (
            <motion.div
              aria-hidden
              className="absolute -inset-[3px] rounded-full"
              style={{ background: `conic-gradient(from 0deg, ${p.accent}, ${shade(p.accent, 60)}, transparent 55%, ${p.accent})` }}
              animate={{ rotate: 360 }}
              transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
            />
          )}
          <div
            className={`relative flex h-28 w-28 items-center justify-center overflow-hidden text-4xl font-bold shadow-xl ring-[5px] ring-[hsl(var(--v-surface))] ${ringShape}`}
            style={{ background: p.accent, color: p.contrast }}
          >
            {p.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatar} alt={p.name} className="h-full w-full object-cover" />
            ) : (
              <span className="v-display">{p.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          {p.verified && (
            <span className="absolute bottom-0 end-0" title="Verified account">
              <VerifiedBadge size={28} absolute={false} />
            </span>
          )}
        </motion.div>

        {/* Name + title — centered */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center"
        >
          <h1 className="v-display text-[26px] font-bold leading-tight">{p.name}</h1>
          {(p.title || p.company) && (
            <p className="mt-1 text-[14px] text-[hsl(var(--v-muted))]">
              {p.title}
              {p.title && p.company ? <span className="mx-1.5 opacity-40">·</span> : ''}
              {p.company && <span className="font-semibold text-[hsl(var(--v-fg))]/80">{p.company}</span>}
            </p>
          )}

          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {chips.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--v-border))] bg-[hsl(var(--v-bg))] px-2.5 py-1 text-[11.5px] font-medium text-[hsl(var(--v-muted))]">
                  {c.dot ? (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: c.dot }} />
                      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: c.dot }} />
                    </span>
                  ) : (
                    <Icon name={c.icon} size={12} />
                  )}
                  {c.label}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
