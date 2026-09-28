'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { API_URL, type PublicCardAction } from '@/lib/api';
import { resolveAction } from '@/lib/brandIcons';
import { appLink, platformOf } from '@/lib/appLinks';
import { paymentBrand } from '@/lib/paymentBrands';
import { embedUrl, externalUrl, pick, profileStyle, type ProfileData, type ProfileSection } from '@/lib/profile';
import { fill, profileStrings, type ProfileStrings } from '@/lib/profileI18n';
import { brandInk, readableOn, shade } from '@/lib/color';
import { Icon } from '@/components/Icon';
import { VerifiedBadge } from '@/components/Avatar';
import { VMark } from '@/components/brand/VMark';
import { PaymentBrandLogo } from '@/components/brand/PaymentBrandLogo';
import { QRCode } from '@/components/QRCode';
import { Lightbox } from '@/components/Lightbox';
import { Constellation } from '@/components/profile/Constellation';

function visitorId(): string | undefined {
  try {
    return localStorage.getItem('vertex_visitor') ?? undefined;
  } catch {
    return undefined;
  }
}

/** Best-effort analytics; it must never block what the visitor asked for. */
function track(slug: string, type: 'CLICK' | 'SAVE' | 'SHARE', metadata?: Record<string, unknown>) {
  try {
    fetch(`${API_URL}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, type, visitorId: visitorId(), metadata }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}

type Resolved = { a: PublicCardAction; href: string; label: string; sub: string; icon: string; color: string; quick: boolean };

export function PublicProfile({
  profile,
  preview = false,
  query = {},
}: {
  profile: ProfileData;
  /**
   * Rendered inside the Studio: nothing is sent or tracked, links do not
   * navigate, and sheets stay inside the frame instead of the window.
   */
  preview?: boolean;
  /** The page's own ?p, ?code and ?t, carried into the contact file and leads. */
  query?: { p?: string; code?: string; t?: string };
}) {
  const t = profileStrings(profile.lang);
  const dir = profile.lang === 'ar' ? 'rtl' : 'ltr';
  const [sheet, setSheet] = useState<'share' | 'exchange' | null>(null);
  const [saved, setSaved] = useState(false);
  const [gallery, setGallery] = useState<{ images: string[]; index: number } | null>(null);

  const links = useMemo<Resolved[]>(
    () =>
      profile.actions
        .map((a) => {
          const r = resolveAction(a, profile.slug);
          if (!r) return null;
          return { a, href: r.href, label: t.labels[r.brand.label] ?? r.brand.label, sub: r.subtitle === r.brand.label ? '' : r.subtitle, icon: r.brand.icon, color: r.brand.color, quick: r.isQuickContact };
        })
        .filter((x): x is Resolved => x !== null),
    [profile.actions, profile.slug, t],
  );
  const quick = links.filter((l) => l.quick).slice(0, 4);
  const rest = links.filter((l) => !l.quick);

  const vq = new URLSearchParams();
  if (query.p) vq.set('p', query.p);
  if (query.code) vq.set('code', query.code);
  const vcardUrl = `${API_URL}/c/${profile.slug}/vcard${vq.toString() ? `?${vq}` : ''}`;

  /** In the preview a tap only shows what would happen. */
  const guard = (e: React.MouseEvent) => {
    if (preview) e.preventDefault();
  };
  const onLink = (e: React.MouseEvent, l: Resolved) => {
    if (preview) return e.preventDefault();
    track(profile.slug, 'CLICK', { kind: 'link', type: l.a.type, actionId: l.a.id });
    if (!profile.openInApp) return;
    const target = appLink(l.href, platformOf(navigator.userAgent, navigator.maxTouchPoints));
    if (!target) return;
    e.preventDefault();
    window.location.href = target;
  };

  const metaItems: { key: string; label: React.ReactNode; icon?: string; dot?: boolean }[] = [];
  if (profile.meta.available) metaItems.push({ key: 'available', label: profile.meta.available === 'now' ? t.available : profile.meta.available, dot: true });
  if (profile.meta.location) metaItems.push({ key: 'location', label: profile.meta.location, icon: 'map-pin' });
  if (profile.meta.languages) metaItems.push({ key: 'languages', label: profile.meta.languages, icon: 'globe' });
  if (profile.meta.responseTime) {
    // The owner may type the time in another language than the card's, so it
    // is isolated to keep the sentence in order.
    const [before, after = ''] = t.respondsIn.split('{{time}}');
    metaItems.push({ key: 'response', label: <>{before}<bdi>{profile.meta.responseTime}</bdi>{after}</>, icon: 'clock' });
  }

  const body = (
    <>
      <Cover profile={profile} t={t} onShare={() => setSheet('share')} />

      <div className="px-5 pb-8">
        <div className="-mt-11 flex items-end justify-between">
          <Avatar profile={profile} />
        </div>

        <h1 className="mt-3 flex items-center gap-1.5 text-[24px] font-semibold leading-tight tracking-[-0.02em] rtl:tracking-normal">
          <span className="min-w-0 break-words">{profile.name}</span>
          {profile.verified && (
            <span title={t.verified} className="shrink-0">
              <VerifiedBadge size={20} absolute={false} />
            </span>
          )}
        </h1>
        {profile.title && <p className="mt-1 text-[15px] leading-snug text-[var(--p-muted)]">{profile.title}</p>}

        {metaItems.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] text-[var(--p-muted)]">
            {metaItems.map((m) => (
              <li key={m.key} className="flex items-center gap-1.5">
                {m.dot ? <span className="h-2 w-2 rounded-full bg-[#22a06b]" aria-hidden /> : <Icon name={m.icon!} size={14} className="text-[var(--p-faint)]" />}
                {m.label}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <a
            href={vcardUrl}
            onClick={(e) => {
              if (preview) e.preventDefault();
              else track(profile.slug, 'SAVE');
              setSaved(true);
              setTimeout(() => setSaved(false), 2200);
            }}
            className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[var(--p-accent)] px-3 text-[15px] font-medium text-[var(--p-on-accent)] transition-opacity active:opacity-85"
          >
            <Icon name={saved ? 'check' : 'user-plus'} size={17} />
            <span className="truncate">{saved ? t.saved : t.save}</span>
          </a>
          <button
            onClick={() => setSheet('exchange')}
            className="flex h-12 items-center justify-center gap-2 rounded-[12px] px-3 text-[15px] font-medium ring-1 ring-inset ring-[var(--p-line-strong)] transition-colors active:bg-[var(--p-elevated)]"
          >
            <Icon name="swap" size={17} className="text-[var(--p-muted)]" />
            <span className="truncate">{t.exchange}</span>
          </button>
        </div>

        {quick.length > 0 && (
          <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${quick.length}, minmax(0, 1fr))` }}>
            {quick.map((l) => (
              <a
                key={l.a.id}
                href={l.href}
                target={l.href.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
                onClick={(e) => onLink(e, l)}
                className="flex h-[62px] flex-col items-center justify-center gap-1 rounded-[12px] bg-[var(--p-elevated)] transition-opacity active:opacity-80"
              >
                <Icon name={l.icon} size={19} className="text-[var(--p-accent)]" />
                <span className="max-w-full truncate px-1 text-[12px] font-medium text-[var(--p-muted)]">{l.label}</span>
              </a>
            ))}
          </div>
        )}

        {profile.about && (
          <Block title={t.about}>
            <About text={profile.about} t={t} />
          </Block>
        )}

        {rest.length > 0 && (
          <Block title={t.links}>
            {profile.linkStyle === 'icons' ? (
              <ul className="flex flex-wrap gap-2.5">
                {rest.map((l) => (
                  <li key={l.a.id}>
                    <a
                      href={l.href}
                      target={/^https?:/.test(l.href) ? '_blank' : undefined}
                      rel="noreferrer"
                      onClick={(e) => onLink(e, l)}
                      aria-label={l.label}
                      title={l.label}
                      className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-[var(--p-elevated)] ring-1 ring-inset ring-[var(--p-line)] transition-opacity active:opacity-80"
                    >
                      <span style={{ color: brandInk(l.color, profile.mode) }} className="flex">
                        <Icon name={l.icon} size={20} />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : profile.linkStyle === 'buttons' ? (
              <ul className="space-y-2">
                {rest.map((l) => (
                  <li key={l.a.id}>
                    <a
                      href={l.href}
                      target={/^https?:/.test(l.href) ? '_blank' : undefined}
                      rel="noreferrer"
                      onClick={(e) => onLink(e, l)}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] px-4 text-[15px] font-medium ring-1 ring-inset ring-[var(--p-line-strong)] transition-colors active:bg-[var(--p-elevated)]"
                    >
                      <span style={{ color: brandInk(l.color, profile.mode) }} className="flex shrink-0">
                        <Icon name={l.icon} size={18} />
                      </span>
                      <span className="truncate">{l.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <List>
                {rest.map((l) => (
                  <Row
                    key={l.a.id}
                    href={l.href}
                    onClick={(e) => onLink(e, l)}
                    icon={
                      <Tile>
                        <span style={{ color: brandInk(l.color, profile.mode) }} className="flex">
                          <Icon name={l.icon} size={18} />
                        </span>
                      </Tile>
                    }
                    label={l.label}
                    sub={l.sub}
                  />
                ))}
              </List>
            )}
          </Block>
        )}

        {profile.paymentLinks.length > 0 && (
          <Block title={t.payments}>
            <List>
              {profile.paymentLinks.map((p) => (
                <Row
                  key={p.id}
                  href={p.url}
                  rel="noopener noreferrer nofollow"
                  onClick={(e) => {
                    if (preview) return e.preventDefault();
                    track(profile.slug, 'CLICK', { kind: 'payment', platform: p.platform, paymentLinkId: p.id, identity: profile.profileName });
                  }}
                  icon={<PaymentBrandLogo platform={p.platform} size={36} />}
                  label={p.displayName}
                  sub={p.description || paymentBrand(p.platform).label}
                  plainSub
                />
              ))}
            </List>
          </Block>
        )}

        {profile.sections.map((s) => (
          <SectionBlock
            key={s.id}
            section={s}
            t={t}
            guard={guard}
            onOpenImage={(images, index) => !preview && setGallery({ images, index })}
          />
        ))}

        <footer className="mt-12 flex items-center justify-center gap-1.5 text-[12px] text-[var(--p-faint)]">
          {t.poweredBy}
          <a href="/" onClick={guard} className="flex items-center gap-1 font-medium text-[var(--p-muted)]">
            <VMark size={12} strokeWidth={3} />
            Vertex Connect
          </a>
        </footer>
      </div>
    </>
  );

  return (
    <div dir={dir} style={profileStyle(profile)} className={`relative bg-[var(--p-surface)] text-[var(--p-fg)] ${preview ? 'h-full overflow-hidden' : ''}`}>
      {preview ? <div className="no-scrollbar h-full overflow-y-auto overscroll-contain">{body}</div> : body}

      <BottomSheet open={sheet === 'share'} onClose={() => setSheet(null)} contained={preview} title={t.shareTitle} closeLabel={t.close}>
        <ShareBody slug={profile.slug} name={profile.name} t={t} preview={preview} />
      </BottomSheet>
      <BottomSheet open={sheet === 'exchange'} onClose={() => setSheet(null)} contained={preview} title={fill(t.exchangeTitle, { name: profile.name })} closeLabel={t.close}>
        <ExchangeBody profile={profile} t={t} preview={preview} tagUid={query.t} />
      </BottomSheet>

      {gallery && <Lightbox images={gallery.images} startIndex={gallery.index} onClose={() => setGallery(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function Cover({ profile, t, onShare }: { profile: ProfileData; t: ProfileStrings; onShare: () => void }) {
  const a = profile.accent;
  return (
    <div className="relative h-[132px] overflow-hidden">
      {profile.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.coverImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : profile.coverStyle === 'constellation' ? (
        <div className="absolute inset-0 bg-[#0b0b0e]">
          <Constellation className="absolute inset-0 h-full w-full opacity-70" />
          <div className="absolute inset-0" style={{ background: `radial-gradient(80% 120% at 85% 0%, ${a}40, transparent 70%)` }} />
        </div>
      ) : profile.coverStyle === 'solid' ? (
        <div className="absolute inset-0" style={{ background: a }} />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${shade(a, 18)}, ${a} 45%, ${shade(a, -40)})` }} />
      )}
      {/* A soft floor so the share button and the tag read on any cover. */}
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/20 to-transparent" aria-hidden />

      {profile.profileName && (
        <span className="absolute start-4 top-4 flex h-8 max-w-[60%] items-center gap-1.5 rounded-full bg-black/30 px-3 text-[12.5px] font-medium text-white backdrop-blur-md">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white" aria-hidden />
          <span className="truncate">{profile.profileName}</span>
        </span>
      )}
      <button
        onClick={onShare}
        aria-label={t.share}
        title={t.share}
        className="absolute end-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition-colors active:bg-black/40"
      >
        <Icon name="share" size={17} />
      </button>
    </div>
  );
}

function Avatar({ profile }: { profile: ProfileData }) {
  const shape = profile.circle ? 'rounded-full' : 'rounded-[22px]';
  return (
    <span
      className={`relative flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden text-[34px] font-semibold ring-4 ring-[var(--p-surface)] ${shape}`}
      style={{ background: profile.accent, color: readableOn(profile.accent) }}
    >
      {profile.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar} alt={profile.name} className="h-full w-full object-cover" />
      ) : (
        (profile.name.trim()[0] || '•').toUpperCase()
      )}
    </span>
  );
}

function Block({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      {title && <h2 className="mb-2.5 text-[13px] font-medium text-[var(--p-faint)]">{title}</h2>}
      {children}
    </section>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-[var(--p-line)] overflow-hidden rounded-[14px] ring-1 ring-inset ring-[var(--p-line)]">{children}</ul>;
}

function Tile({ children }: { children: React.ReactNode }) {
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--p-elevated)]">{children}</span>;
}

function Row({
  href,
  onClick,
  icon,
  label,
  sub,
  rel = 'noreferrer',
  plainSub = false,
}: {
  href: string;
  onClick: (e: React.MouseEvent) => void;
  icon: React.ReactNode;
  label: string;
  sub?: string;
  rel?: string;
  /** A description rather than an address, so it keeps the reading direction. */
  plainSub?: boolean;
}) {
  const external = /^https?:/.test(href);
  return (
    <li>
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={rel}
        onClick={onClick}
        className="flex min-h-[60px] items-center gap-3 px-3.5 py-2.5 transition-colors active:bg-[var(--p-elevated)]"
      >
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{label}</span>
          {sub && (
            <span dir={plainSub ? undefined : 'ltr'} className={`block truncate text-[13px] text-[var(--p-faint)] ${plainSub ? '' : 'text-start rtl:text-right'}`}>
              {sub}
            </span>
          )}
        </span>
        <Icon name={external ? 'external-link' : 'arrow'} size={15} className="shrink-0 text-[var(--p-faint)] rtl:-scale-x-100" />
      </a>
    </li>
  );
}

function About({ text, t }: { text: string; t: ProfileStrings }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220 || text.split('\n').length > 4;
  return (
    <div>
      <p dir="auto" className={`whitespace-pre-line text-[15px] leading-[1.6] ${!open && long ? 'line-clamp-4' : ''}`}>{text}</p>
      {long && (
        <button onClick={() => setOpen((o) => !o)} className="mt-1.5 min-h-[44px] text-[14px] font-medium text-[var(--p-accent)]">
          {open ? t.showLess : t.readMore}
        </button>
      )}
    </div>
  );
}

function SectionBlock({
  section,
  t,
  guard,
  onOpenImage,
}: {
  section: ProfileSection;
  t: ProfileStrings;
  guard: (e: React.MouseEvent) => void;
  onOpenImage: (images: string[], index: number) => void;
}) {
  const title = pick(section.content, 'title') || undefined;

  if (section.type === 'VIDEO') {
    const src = embedUrl(pick(section.content, 'videoUrl'));
    if (!src) return null;
    return (
      <Block title={title}>
        <div className="aspect-video overflow-hidden rounded-[14px] bg-black ring-1 ring-inset ring-[var(--p-line)]">
          <iframe src={src} title={title ?? 'Video'} className="h-full w-full" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      </Block>
    );
  }

  if (section.type === 'PORTFOLIO') {
    const images = Array.isArray(section.content.images) ? (section.content.images as unknown[]).filter((x): x is string => typeof x === 'string' && !!x) : [];
    if (!images.length) return null;
    return (
      <Block title={title}>
        <div className={`grid gap-1.5 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              onClick={() => onOpenImage(images, i)}
              className={`overflow-hidden rounded-[12px] bg-[var(--p-elevated)] ${images.length === 1 ? 'aspect-[4/3]' : 'aspect-square'} ${images.length === 3 && i === 0 ? 'col-span-2 aspect-[2/1]' : ''}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
            </button>
          ))}
        </div>
      </Block>
    );
  }

  if (section.type === 'BOOKING') {
    const url = pick(section.content, 'bookingUrl');
    if (!url) return null;
    const href = externalUrl(url);
    return (
      <Block title={title}>
        <List>
          <Row
            href={href}
            onClick={guard}
            icon={
              <Tile>
                <Icon name="calendar" size={18} className="text-[var(--p-accent)]" />
              </Tile>
            }
            label={pick(section.content, 'buttonLabel') || t.labels['Book a meeting']}
            sub={href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
          />
        </List>
      </Block>
    );
  }

  const text = pick(section.content, 'body');
  if (!text) return null;
  return (
    <Block title={title}>
      {pick(section.content, 'subtitle') && <p className="mb-1.5 text-[15px] font-medium">{pick(section.content, 'subtitle')}</p>}
      <p dir="auto" className="whitespace-pre-line text-[15px] leading-[1.6] text-[var(--p-muted)]">{text}</p>
    </Block>
  );
}

/* ---------------------------------------------------------------------------
 * Sheets
 * ------------------------------------------------------------------------- */

function BottomSheet({
  open,
  onClose,
  contained,
  title,
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Inside the Studio frame rather than the window. */
  contained: boolean;
  title: string;
  closeLabel: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // The page behind should not scroll while the sheet is up.
    const prev = document.body.style.overflow;
    if (!contained) document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, contained]);

  const pos = contained ? 'absolute' : 'fixed';
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className={`${pos} inset-0 z-40 bg-black/40`} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            className={`${pos} inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88%] w-full max-w-[440px] flex-col rounded-t-[20px] bg-[var(--p-surface)] text-[var(--p-fg)] shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.35)] ${
              contained ? '' : 'max-h-[88dvh] pb-[env(safe-area-inset-bottom)]'
            }`}
          >
            <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--p-line-strong)]" aria-hidden />
            <div className="flex items-start gap-3 px-5 pb-2 pt-3">
              <h2 className="min-w-0 flex-1 text-[17px] font-semibold leading-snug">{title}</h2>
              <button onClick={onClose} aria-label={closeLabel} className="-m-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--p-muted)] active:bg-[var(--p-elevated)]">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ShareBody({ slug, name, t, preview }: { slug: string; name: string; t: ProfileStrings; preview: boolean }) {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    // The clean card address: without the chip or passcode it arrived with.
    const u = new URL(window.location.href);
    setUrl(preview ? `${u.origin}/c/${slug}` : `${u.origin}${u.pathname}${u.searchParams.get('p') ? `?p=${encodeURIComponent(u.searchParams.get('p')!)}` : ''}`);
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, [slug, preview]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (!preview) track(slug, 'SHARE', { via: 'copy' });
    } catch {
      // clipboard blocked; the link is on screen to copy by hand
    }
  }
  async function share() {
    try {
      await navigator.share({ title: name, url });
      if (!preview) track(slug, 'SHARE', { via: 'native' });
    } catch {
      // cancelled
    }
  }

  return (
    <div className="text-center">
      <p className="text-[14px] text-[var(--p-muted)]">{t.shareHint}</p>
      <div className="mx-auto mt-4 w-fit rounded-[16px] bg-white p-3 ring-1 ring-inset ring-black/5">
        <QRCode value={url || `/c/${slug}`} size={196} />
      </div>
      <p dir="ltr" className="mx-auto mt-3 max-w-full truncate font-mono text-[12.5px] text-[var(--p-faint)]">
        {url.replace(/^https?:\/\//, '')}
      </p>
      <div className={`mt-5 grid gap-2 ${canShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <button onClick={copy} className="flex h-12 items-center justify-center gap-2 rounded-[12px] text-[15px] font-medium ring-1 ring-inset ring-[var(--p-line-strong)] active:bg-[var(--p-elevated)]">
          <Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? t.linkCopied : t.copyLink}
        </button>
        {canShare && (
          <button onClick={share} className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[var(--p-accent)] text-[15px] font-medium text-[var(--p-on-accent)] active:opacity-85">
            <Icon name="share" size={16} /> {t.shareVia}
          </button>
        )}
      </div>
    </div>
  );
}

type Intent = 'CONTACT' | 'MEETING' | 'QUOTE';
const SLOTS = ['09:00', '11:00', '13:00', '15:00', '17:00'];

function ExchangeBody({ profile, t, preview, tagUid }: { profile: ProfileData; t: ProfileStrings; preview: boolean; tagUid?: string }) {
  const [intent, setIntent] = useState<Intent>('CONTACT');
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', note: '' });
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Intent | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.email.trim() && !form.phone.trim()) {
      setError(t.needContact);
      return;
    }
    if (preview) {
      setDone(intent);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/leads/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: profile.slug,
          intent,
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          company: form.company.trim() || undefined,
          note: form.note.trim() || undefined,
          meetingAt: intent === 'MEETING' && date && time ? `${date}T${time}:00` : undefined,
          visitorId: visitorId(),
          // The chip this visitor tapped, so the lead is credited to it.
          tagUid,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((Array.isArray(data?.errors) && data.errors[0]?.message) || data?.message || t.failed);
      }
      setDone(intent);
    } catch (err) {
      setError(err instanceof TypeError ? t.failed : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="py-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--p-accent)] text-[var(--p-on-accent)]">
          <Icon name="check" size={22} />
        </span>
        <p className="mt-4 text-[17px] font-semibold">{t.done[done]}</p>
        <p className="mt-1 text-[14px] text-[var(--p-muted)]">{fill(t.doneHint, { name: profile.name })}</p>
        {preview && <p className="mt-3 text-[12.5px] text-[var(--p-faint)]">{t.previewOnly}</p>}
      </div>
    );
  }

  const field = 'h-12 w-full rounded-[12px] bg-[var(--p-elevated)] px-3.5 text-[16px] text-[var(--p-fg)] outline-none ring-1 ring-inset ring-transparent placeholder:text-[var(--p-faint)] focus:ring-[var(--p-accent)]';

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <p className="text-[14px] text-[var(--p-muted)]">{t.exchangeHint}</p>
      <div role="radiogroup" className="flex rounded-[12px] bg-[var(--p-elevated)] p-1">
        {(['CONTACT', 'MEETING', 'QUOTE'] as const).map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={intent === i}
            onClick={() => {
              setIntent(i);
              setError('');
            }}
            className={`h-10 flex-1 rounded-[9px] text-[14px] font-medium transition-colors ${intent === i ? 'bg-[var(--p-surface)] text-[var(--p-fg)] shadow-sm' : 'text-[var(--p-muted)]'}`}
          >
            {t.intents[i]}
          </button>
        ))}
      </div>

      <input className={field} placeholder={t.fullName} value={form.name} onChange={set('name')} required autoComplete="name" aria-label={t.fullName} />
      <input className={field} type="email" dir="ltr" placeholder={t.email} value={form.email} onChange={set('email')} autoComplete="email" aria-label={t.email} style={{ textAlign: profile.lang === 'ar' ? 'right' : 'left' }} />
      <input className={field} type="tel" dir="ltr" placeholder={t.phone} value={form.phone} onChange={set('phone')} autoComplete="tel" aria-label={t.phone} style={{ textAlign: profile.lang === 'ar' ? 'right' : 'left' }} />
      <input className={field} placeholder={`${t.company} (${t.optional})`} value={form.company} onChange={set('company')} autoComplete="organization" aria-label={t.company} />

      {intent === 'MEETING' && (
        <div className="space-y-2 pt-1">
          <label className="block">
            <span className="mb-1.5 block text-[13px] text-[var(--p-muted)]">{t.pickDay}</span>
            <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} required className={field} />
          </label>
          <div>
            <span className="mb-1.5 block text-[13px] text-[var(--p-muted)]">{t.time}</span>
            <div className="grid grid-cols-5 gap-1.5">
              {SLOTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTime(s)}
                  aria-pressed={time === s}
                  dir="ltr"
                  className={`h-11 rounded-[10px] text-[14px] tabular-nums ${time === s ? 'bg-[var(--p-accent)] text-[var(--p-on-accent)]' : 'bg-[var(--p-elevated)] text-[var(--p-fg)]'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {intent !== 'CONTACT' && (
        <textarea
          rows={3}
          className={`${field} h-auto resize-none py-3`}
          placeholder={intent === 'QUOTE' ? t.quoteNote : `${t.note} (${t.optional})`}
          value={form.note}
          onChange={set('note')}
          required={intent === 'QUOTE'}
          aria-label={t.note}
        />
      )}

      {error && <p role="alert" className="text-[13.5px] text-[#d4453a]">{error}</p>}

      <button type="submit" disabled={busy || (intent === 'MEETING' && !time)} className="mt-1 flex h-12 w-full items-center justify-center rounded-[12px] bg-[var(--p-accent)] text-[15px] font-medium text-[var(--p-on-accent)] disabled:opacity-50">
        {busy ? t.sending : t.send[intent]}
      </button>
    </form>
  );
}

