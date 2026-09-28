'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Card, Section, CardAction } from '@/lib/client';
import { PublicProfile } from '@/components/profile/PublicProfile';
import { buildProfile, profileStyle, type ProfileData } from '@/lib/profile';
import { profileStrings } from '@/lib/profileI18n';
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

const GROUPS: { label: 'phones' | 'screens' | 'nfc' | 'qr'; items: { id: Device; icon: string; name: string }[] }[] = [
  {
    label: 'phones',
    items: [
      { id: 'iphone', icon: 'phone', name: 'iPhone' },
      { id: 'android', icon: 'phone', name: 'Android' },
    ],
  },
  {
    label: 'screens',
    items: [
      { id: 'tablet', icon: 'grid', name: 'Tablet' },
      { id: 'desktop', icon: 'gauge', name: 'Desktop' },
      { id: 'watch', icon: 'clock', name: 'Watch' },
    ],
  },
  {
    label: 'nfc',
    items: [
      { id: 'smart-card', icon: 'sparkle', name: 'Smart Card' },
      { id: 'metal-card', icon: 'sparkle', name: 'Metal Card' },
      { id: 'leather-keychain', icon: 'tag', name: 'Keychain' },
      { id: 'sticker', icon: 'sparkle', name: 'Sticker' },
    ],
  },
  {
    label: 'qr',
    items: [{ id: 'qr', icon: 'qr', name: 'QR Page' }],
  },
];

/** The payment links the Studio holds; only what the card shows is needed. */
export interface PreviewPaymentLink {
  id: string;
  platform: string;
  displayName: string;
  url?: string;
  description?: string | null;
  isActive?: boolean;
  order?: number;
}

/** The width a phone lays the card out at; narrower frames scale it down. */
const PHONE_WIDTH = 390;
const CARD_MAX = 440;

/**
 * The published card, drawn at a real phone's width and scaled to fit the
 * frame, so the preview matches what a visitor gets instead of approximating it.
 */
function ScaledProfile({ profile }: { profile: ProfileData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const z = size.w && size.w < PHONE_WIDTH ? size.w / PHONE_WIDTH : 1;
  const wide = size.w > CARD_MAX + 40;
  return (
    <div ref={ref} className="h-full w-full">
      {size.w > 0 &&
        (wide ? (
          // A screen wider than a phone sees the card as a card, like the live page.
          <div style={profileStyle(profile)} className="flex h-full justify-center overflow-hidden bg-[var(--p-bg)] px-6 pt-6">
            <div className="h-full w-full max-w-[440px] overflow-hidden rounded-t-[20px] shadow-[0_0_0_1px_var(--p-line)]">
              <PublicProfile profile={profile} preview />
            </div>
          </div>
        ) : (
          <div style={{ width: size.w / z, height: size.h / z, zoom: z }}>
            <PublicProfile profile={profile} preview />
          </div>
        ))}
    </div>
  );
}

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
  const { t } = useTranslation('cardEditor');
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
      flash(t('preview.saved'));
    } catch {
      flash(t('preview.failed'));
    } finally {
      setShooting(false);
    }
  }

  function sharePreview() {
    const url = publicUrl;
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: name, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).then(() => flash(t('preview.copied'))).catch(() => {});
    }
  }

  const canRotate = HANDHELD.has(device);
  const canZoom = device !== 'qr' && !IS_NFC(device);

  const profile = useMemo(
    () =>
      buildProfile({
        slug,
        theme: previewCard.theme,
        vcardData: card.vcardData,
        sections,
        actions: actions.filter((a) => a.isActive),
        paymentLinks: paymentLinks
          .filter((l) => l.isActive !== false)
          .map((l, i) => ({ id: l.id, platform: l.platform, displayName: l.displayName, url: l.url ?? '#', description: l.description ?? null, order: l.order ?? i })),
        fallbackName: profileStrings(previewCard.theme?.lang === 'ar' ? 'ar' : 'en').yourName,
      }),
    [slug, previewCard.theme, card.vcardData, sections, actions, paymentLinks],
  );

  const screen = <ScaledProfile profile={profile} />;

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
    <div className="flex flex-wrap items-center justify-center gap-0.5">
      <ToolButton label={t('preview.zoomOut')} onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))} disabled={!canZoom}>
        <span className="text-[15px] leading-none">−</span>
      </ToolButton>
      <button
        onClick={() => setZoom(1)}
        disabled={!canZoom}
        title={t('preview.zoomReset')}
        className="tabular h-8 min-w-11 rounded-md px-1 text-[12px] text-muted hover:bg-surface hover:text-ink disabled:opacity-40"
      >
        {Math.round(zoom * 100)}%
      </button>
      <ToolButton label={t('preview.zoomIn')} onClick={() => setZoom((z) => Math.min(1.2, +(z + 0.1).toFixed(2)))} disabled={!canZoom}>
        <span className="text-[15px] leading-none">+</span>
      </ToolButton>
      <Divider />
      <ToolButton label={t('preview.rotate')} onClick={() => setLandscape((l) => !l)} active={landscape} disabled={!canRotate}>
        <Icon name="refresh" size={14} />
      </ToolButton>
      <ToolButton label={t('preview.dark')} onClick={() => setDarkOverride((d) => !(d ?? cardMode === 'dark'))} active={effDark}>
        <Icon name={effDark ? 'moon' : 'sun'} size={14} />
      </ToolButton>
      <ToolButton label={t('preview.rtl')} onClick={() => setRtlOverride((r) => !(r ?? cardLang === 'ar'))} active={effRtl}>
        <span className="text-[12px] font-semibold leading-none">{effRtl ? 'ع' : 'A'}</span>
      </ToolButton>
      <Divider />
      <ToolButton label={t('preview.screenshot')} onClick={screenshot} disabled={shooting}>
        <Icon name={shooting ? 'loader' : 'image'} size={14} className={shooting ? 'animate-spin' : ''} />
      </ToolButton>
      <ToolButton label={t('preview.share')} onClick={sharePreview}>
        <Icon name="send" size={14} />
      </ToolButton>
      <ToolButton label={t('preview.fullscreen')} onClick={() => setFullscreen(true)}>
        <Icon name="columns" size={14} />
      </ToolButton>
    </div>
  );

  const deviceSelector = (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{t('preview.device')}</span>
      <select
        value={device}
        onChange={(e) => {
          setDevice(e.target.value as Device);
          setLandscape(false);
          setZoom(1);
        }}
        className="h-8 appearance-none rounded-lg bg-surface pe-8 ps-3 text-[13px] font-medium text-ink shadow-sm ring-1 ring-inset ring-line outline-none focus:ring-accent"
      >
        {GROUPS.map((g) => (
          <optgroup key={g.label} label={t(`preview.groups.${g.label}`)}>
            {g.items.map((it) => (
              <option key={it.id} value={it.id}>
                {t(`preview.devices.${it.id}`, it.name)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="pointer-events-none absolute end-2.5 text-faint">
        <Icon name="chevron-down" size={14} />
      </span>
    </label>
  );

  return (
    <>
      <div className="flex flex-col items-center gap-4 w-full">
        {/* Choosing a device to simulate and zooming it is a desktop job —
            on a phone you are already looking at the real thing. Hiding this
            also removes ~20 sub-40px controls from the phone layout. */}
        <div className="hidden w-full flex-wrap items-center justify-between gap-2 lg:flex">
          {deviceSelector}
          {toolbar}
        </div>
        <div className="flex min-h-[640px] w-full items-center justify-center overflow-hidden py-2">{stage}</div>
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
              <button onClick={() => setFullscreen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20" title={t('preview.exitFullscreen')} aria-label={t('preview.exitFullscreen')}>
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
            className="fixed inset-x-0 bottom-6 z-[110] mx-auto flex w-fit items-center gap-2 rounded-lg bg-[#17171a] px-3.5 py-2.5 text-[13px] font-medium text-white shadow-lg"
          >
            <Icon name="check" size={15} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-line-strong" style={{ background: 'hsl(var(--v-border-strong))' }} />;
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
  const cls = `inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-40 ${
    active ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:bg-surface hover:text-ink'
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
