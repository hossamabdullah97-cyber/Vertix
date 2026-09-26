'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card, Section, CardAction } from '@/lib/client';
import CardPreview, { type PreviewPaymentLink } from '@/components/CardPreview';
import { Icon } from '@/components/Icon';
import { IPhoneFrame, AndroidFrame, TabletFrame, DesktopFrame, WatchFrame } from './frames';
import { NfcProduct, type NfcVariant } from './NfcProduct';
import { QrCard } from './QrCard';
import { LiveCounters } from './LiveCounters';

type Device =
  | 'iphone'
  | 'android'
  | 'tablet'
  | 'desktop'
  | 'watch'
  | 'smart-card'
  | 'metal-card'
  | 'leather-keychain'
  | 'sticker'
  | 'qr';

const GROUPS: { label: string; items: { id: Device; icon: string; name: string }[] }[] = [
  {
    label: 'Phones',
    items: [
      { id: 'iphone', icon: 'phone', name: 'iPhone' },
      { id: 'android', icon: 'phone', name: 'Android' },
    ],
  },
  {
    label: 'Screens',
    items: [
      { id: 'tablet', icon: 'grid', name: 'Tablet' },
      { id: 'desktop', icon: 'gauge', name: 'Desktop' },
      { id: 'watch', icon: 'clock', name: 'Watch' },
    ],
  },
  {
    label: 'NFC',
    items: [
      { id: 'smart-card', icon: 'sparkle', name: 'Smart Card' },
      { id: 'metal-card', icon: 'sparkle', name: 'Metal Card' },
      { id: 'leather-keychain', icon: 'tag', name: 'Keychain' },
      { id: 'sticker', icon: 'sparkle', name: 'Sticker' },
    ],
  },
  {
    label: 'QR',
    items: [{ id: 'qr', icon: 'qr', name: 'QR Page' }],
  },
];

const HANDHELD = new Set<Device>(['iphone', 'android', 'tablet']);
const IS_NFC = (d: Device): d is NfcVariant =>
  d === 'smart-card' || d === 'metal-card' || d === 'leather-keychain' || d === 'sticker';

export default function LivePreview({
  card,
  sections,
  actions,
  paymentLinks = [],
  slug,
  qrUrl,
}: {
  card: Card;
  sections: Section[];
  actions: CardAction[];
  paymentLinks?: PreviewPaymentLink[];
  slug: string;
  qrUrl: string;
}) {
  const [device, setDevice] = useState<Device>('iphone');
  const [zoom, setZoom] = useState(1);
  const [landscape, setLandscape] = useState(false);
  const [darkOverride, setDarkOverride] = useState<boolean | null>(null);
  const [rtlOverride, setRtlOverride] = useState<boolean | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [toast, setToast] = useState('');
  const [origin, setOrigin] = useState('');

  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  const publicUrl = origin ? `${origin}/c/${slug}` : `/c/${slug}`;

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  }

  // Preview-only theme overrides (do NOT mutate the saved card).
  const cardMode = (card.theme?.mode as string) === 'dark' ? 'dark' : 'light';
  const cardLang = (card.theme?.lang as string) === 'ar' ? 'ar' : 'en';
  const effDark = darkOverride ?? cardMode === 'dark';
  const effRtl = rtlOverride ?? cardLang === 'ar';

  const previewCard = useMemo(
    () => ({
      ...card,
      theme: { ...card.theme, mode: effDark ? 'dark' : 'light', lang: effRtl ? 'ar' : 'en' },
    }),
    [card, effDark, effRtl],
  );

  const name = (card.vcardData?.fullName as string) || 'Your name';
  const org = (card.vcardData?.org as string) || '';

  function reload() {
    setReloading(true);
    setReloadKey((k) => k + 1);
    setTimeout(() => setReloading(false), 650);
  }

  async function screenshot() {
    if (!stageRef.current) return;
    setShooting(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(stageRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        skipFonts: false,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${slug}-${device}.png`;
      a.click();
      flash('Screenshot saved');
    } catch {
      flash('Screenshot failed');
    } finally {
      setShooting(false);
    }
  }

  function sharePreview() {
    const url = publicUrl;
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: name, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).then(() => flash('Preview link copied')).catch(() => {});
    }
  }

  const canRotate = HANDHELD.has(device);
  const canZoom = device !== 'qr' && !IS_NFC(device);

  const screen = (
    <CardPreview card={previewCard as Card} sections={sections} actions={actions} paymentLinks={paymentLinks} />
  );

  const stage = (
    <div
      ref={stageRef}
      key={reloadKey}
      className="relative flex origin-center items-center justify-center transition-transform duration-300"
      style={{ transform: `scale(${zoom}) rotate(${landscape && canRotate ? 90 : 0}deg)` }}
    >
      <AnimatePresence>
        {reloading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center rounded-[44px] bg-black/30 backdrop-blur-sm"
          >
            <span className="v-loader text-white">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 3a9 9 0 1 0 9 9" />
              </svg>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {device === 'iphone' && <IPhoneFrame>{screen}</IPhoneFrame>}
      {device === 'android' && <AndroidFrame>{screen}</AndroidFrame>}
      {device === 'tablet' && <TabletFrame>{screen}</TabletFrame>}
      {device === 'desktop' && <DesktopFrame url={publicUrl}>{screen}</DesktopFrame>}
      {device === 'watch' && <WatchFrame>{screen}</WatchFrame>}
      {IS_NFC(device) && (
        <NfcProduct variant={device} name={name} org={org} qrUrl={qrUrl} accent={(card.theme?.accent as string) || '#2563eb'} />
      )}
      {device === 'qr' && <QrCard url={publicUrl} name={name} />}
    </div>
  );

  const toolbar = (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {/* Zoom cluster — one segmented control, uniform cell sizes */}
      <div className="inline-flex items-center rounded-lg border border-line bg-canvas/60 p-0.5">
        <button
          onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))}
          disabled={!canZoom}
          title="Zoom out"
          aria-label="Zoom out"
          className="flex h-7 w-7 items-center justify-center rounded-md text-[15px] font-bold text-ink hover:bg-canvas disabled:opacity-40"
        >
          −
        </button>
        <button
          onClick={() => setZoom(1)}
          disabled={!canZoom}
          title="Fit to 100%"
          className="h-7 w-11 rounded-md text-[11px] font-bold tabular-nums text-muted hover:bg-canvas disabled:opacity-40"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => setZoom((z) => Math.min(1.2, +(z + 0.1).toFixed(2)))}
          disabled={!canZoom}
          title="Zoom in"
          aria-label="Zoom in"
          className="flex h-7 w-7 items-center justify-center rounded-md text-[15px] font-bold text-ink hover:bg-canvas disabled:opacity-40"
        >
          +
        </button>
      </div>

      <Divider />

      <ToolButton label="Rotate device" onClick={() => setLandscape((l) => !l)} active={landscape} disabled={!canRotate}>
        <Icon name="external-link" size={15} />
      </ToolButton>
      <ToolButton label="Dark mode" onClick={() => setDarkOverride((d) => !(d ?? cardMode === 'dark'))} active={effDark}>
        <Icon name={effDark ? 'moon' : 'sun'} size={15} />
      </ToolButton>
      <ToolButton label="Right-to-left" onClick={() => setRtlOverride((r) => !(r ?? cardLang === 'ar'))} active={effRtl}>
        <span className="text-[12px] font-black leading-none">{effRtl ? 'ع' : 'A'}</span>
      </ToolButton>
      <ToolButton label="Reload preview" onClick={reload}>
        <Icon name="logout" size={15} className="rotate-180" />
      </ToolButton>

      <Divider />

      <ToolButton label="Screenshot" onClick={screenshot} disabled={shooting}>
        <Icon name={shooting ? 'loader' : 'image'} size={15} className={shooting ? 'animate-spin' : ''} />
      </ToolButton>
      <ToolButton label="Share preview" onClick={sharePreview}>
        <Icon name="send" size={15} />
      </ToolButton>
      <ToolButton label="Open published view" href={publicUrl}>
        <Icon name="external-link" size={15} />
      </ToolButton>
      <ToolButton label="Fullscreen" onClick={() => setFullscreen(true)}>
        <Icon name="grid" size={15} />
      </ToolButton>
    </div>
  );

  const deviceSelector = (
    <div className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-full border border-line bg-canvas/60 p-1 shadow-sm">
      {GROUPS.map((g, gi) => (
        <div key={g.label} className="flex items-center gap-1">
          {gi > 0 && <span className="mx-0.5 h-4 w-px bg-line" />}
          {g.items.map((it) => (
            <button
              key={it.id}
              onClick={() => {
                setDevice(it.id);
                setLandscape(false);
                setZoom(1);
              }}
              className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-bold transition-all ${
                device === it.id ? 'bg-[var(--ds-accent)] text-white shadow-sm' : 'text-muted hover:text-ink'
              }`}
              title={it.name}
            >
              <Icon name={it.icon} size={12} />
              <span className="hidden sm:inline">{it.name}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div className="flex flex-col items-center gap-4 w-full">
        {/* Choosing a device to simulate and zooming it is a desktop job —
            on a phone you are already looking at the real thing. Hiding this
            also removes ~20 sub-40px controls from the phone layout. */}
        <div className="sticky top-0 z-10 w-full hidden lg:flex flex-col items-center gap-2.5 bg-surface/95 backdrop-blur-md py-3.5 border-b border-line shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] rounded-t-2xl">
          {deviceSelector}
          {toolbar}
        </div>
        <div className="flex min-h-[680px] w-full items-center justify-center overflow-hidden py-4">{stage}</div>
        <LiveCounters cardId={card.id} />
      </div>

      {/* Fullscreen immersive mode */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col bg-[#0a0a0f]/95 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div className="flex items-center gap-2 text-white/80">{deviceSelector}</div>
              <button onClick={() => setFullscreen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" title="Exit fullscreen">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto p-6">{stage}</div>
            <div className="flex justify-center border-t border-white/10 py-3">{toolbar}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed inset-x-0 bottom-6 z-[110] mx-auto flex w-fit items-center gap-2 rounded-full bg-[#16161a] px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg"
          >
            <Icon name="check" size={15} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-line" />;
}

function ToolButton({
  children,
  label,
  onClick,
  href,
  active,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  const cls = `inline-flex h-8 w-8 items-center justify-center rounded-lg border text-ink transition-all disabled:opacity-40 ${
    active ? 'border-[var(--ds-accent)] bg-accent-soft text-accent' : 'border-line bg-canvas/60 hover:bg-canvas'
  }`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" title={label} aria-label={label} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} title={label} aria-label={label} aria-pressed={active} className={cls}>
      {children}
    </button>
  );
}
