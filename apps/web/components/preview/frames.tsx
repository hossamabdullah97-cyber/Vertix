'use client';

import type { ReactNode } from 'react';

/** Shared glassy screen reflection overlay for handheld devices. */
function ScreenGlare() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20"
      style={{
        background:
          'linear-gradient(125deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 26%, rgba(255,255,255,0) 74%, rgba(255,255,255,0.05) 100%)',
      }}
    />
  );
}

/** Scrollable screen surface — native momentum, hidden scrollbar. */
function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="no-scrollbar h-full w-full overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
      {children}
    </div>
  );
}

export function IPhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative shrink-0"
      style={{ width: 320, height: 660, padding: 12, borderRadius: 56, background: 'linear-gradient(145deg, #2a2a32, #0e0e12)', boxShadow: '0 40px 80px -24px rgba(0,0,0,0.55), inset 0 0 0 2px #3a3a44, inset 0 0 3px rgba(255,255,255,0.25)' }}
    >
      {/* side buttons */}
      <span className="absolute -left-[3px] top-28 h-9 w-[3px] rounded-l bg-[#26262e]" />
      <span className="absolute -left-[3px] top-40 h-14 w-[3px] rounded-l bg-[#26262e]" />
      <span className="absolute -left-[3px] top-56 h-14 w-[3px] rounded-l bg-[#26262e]" />
      <span className="absolute -right-[3px] top-44 h-20 w-[3px] rounded-r bg-[#26262e]" />
      <div className="relative h-full w-full overflow-hidden bg-black" style={{ borderRadius: 44 }}>
        {/* Dynamic Island */}
        <div className="absolute left-1/2 top-2.5 z-30 flex h-[26px] w-[95px] -translate-x-1/2 items-center justify-end gap-2 rounded-full bg-black pe-2.5">
          <span className="h-2 w-2 rounded-full bg-[#0d1a2a] ring-1 ring-white/10" />
        </div>
        <ScreenGlare />
        <Screen>{children}</Screen>
      </div>
    </div>
  );
}

export function AndroidFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative shrink-0"
      style={{ width: 314, height: 648, padding: 8, borderRadius: 40, background: 'linear-gradient(145deg, #202026, #0c0c10)', boxShadow: '0 40px 80px -24px rgba(0,0,0,0.5), inset 0 0 0 2px #33333c' }}
    >
      <span className="absolute -right-[3px] top-36 h-16 w-[3px] rounded-r bg-[#26262e]" />
      <div className="relative h-full w-full overflow-hidden bg-black" style={{ borderRadius: 34 }}>
        {/* centered hole-punch camera */}
        <div className="absolute left-1/2 top-3 z-30 h-3 w-3 -translate-x-1/2 rounded-full bg-black ring-1 ring-white/10">
          <span className="absolute inset-[3px] rounded-full bg-[#0d1a2a]" />
        </div>
        <ScreenGlare />
        <Screen>{children}</Screen>
      </div>
    </div>
  );
}

export function TabletFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative shrink-0"
      style={{ width: 440, height: 600, padding: 14, borderRadius: 34, background: 'linear-gradient(145deg, #26262e, #0d0d11)', boxShadow: '0 40px 80px -24px rgba(0,0,0,0.5), inset 0 0 0 2px #35353f' }}
    >
      <div className="relative h-full w-full overflow-hidden bg-black" style={{ borderRadius: 22 }}>
        <span className="absolute left-1/2 top-2.5 z-30 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#0d1a2a] ring-1 ring-white/10" />
        <ScreenGlare />
        <Screen>{children}</Screen>
      </div>
    </div>
  );
}

export function DesktopFrame({ children, url }: { children: ReactNode; url: string }) {
  return (
    <div className="shrink-0" style={{ width: 560 }}>
      <div
        className="overflow-hidden rounded-t-xl border border-b-0 border-line bg-canvas"
        style={{ boxShadow: '0 40px 80px -30px rgba(0,0,0,0.45)' }}
      >
        {/* browser chrome */}
        <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <span className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </span>
          <div className="ms-2 flex flex-1 items-center gap-2 truncate rounded-md bg-canvas px-3 py-1.5 text-[11px] text-muted">
            <span className="text-emerald-500">🔒</span>
            <span className="truncate">{url}</span>
          </div>
        </div>
        <div className="no-scrollbar h-[440px] overflow-y-auto bg-white">{children}</div>
      </div>
      {/* stand */}
      <div className="mx-auto h-3 w-40 rounded-b-lg bg-gradient-to-b from-[#c9ccd6] to-[#9aa0ad] dark:from-[#2a2a32] dark:to-[#17171c]" />
      <div className="mx-auto h-1.5 w-52 rounded-full bg-[#8a90a0]/40" />
    </div>
  );
}

export function WatchFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <span className="h-8 w-24 rounded-t-[28px] bg-gradient-to-b from-[#3a3a44] to-[#1c1c22]" />
      <div
        className="relative shrink-0"
        style={{ width: 220, height: 260, padding: 12, borderRadius: 56, background: 'linear-gradient(145deg, #2a2a32, #0e0e12)', boxShadow: '0 30px 60px -20px rgba(0,0,0,0.5), inset 0 0 0 2px #3a3a44' }}
      >
        <span className="absolute -right-[4px] top-1/2 h-10 w-[4px] -translate-y-1/2 rounded-r bg-[#26262e]" />
        <div className="relative h-full w-full overflow-hidden bg-black" style={{ borderRadius: 46 }}>
          <ScreenGlare />
          <div className="no-scrollbar h-full w-full overflow-y-auto">{children}</div>
        </div>
      </div>
      <span className="h-8 w-24 rounded-b-[28px] bg-gradient-to-t from-[#3a3a44] to-[#1c1c22]" />
    </div>
  );
}
