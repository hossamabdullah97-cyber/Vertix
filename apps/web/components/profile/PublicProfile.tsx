'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_URL, type PublicCardAction } from '@/lib/api';
import { resolveAction } from '@/lib/brandIcons';
import { appLink, platformOf } from '@/lib/appLinks';
import { paymentBrand } from '@/lib/paymentBrands';
import { embedUrl, externalUrl, initials, inkStyle, pick, profileAttrs, profileStyle, type ProfileData, type ProfileSection } from '@/lib/profile';
import { fill, profileStrings, type ProfileStrings } from '@/lib/profileI18n';
import { readableOn, shade } from '@/lib/color';
import { Icon } from '@/components/Icon';
import { VerifiedBadge } from '@/components/Avatar';
import { VMark } from '@/components/brand/VMark';
import { PaymentBrandLogo } from '@/components/brand/PaymentBrandLogo';
import { QRCode } from '@/components/QRCode';
import { Lightbox } from '@/components/Lightbox';
import { Constellation } from '@/components/profile/Constellation';
import { isEmail, useChecks } from '@/lib/validate';

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

type MetaItem = { key: string; label: React.ReactNode; icon?: string; dot?: boolean };

type Resolved = { a: PublicCardAction; href: string; label: string; sub: string; icon: string; color: string; quick: boolean };

export function PublicProfile({
  profile,
  preview = false,
  query = {},
  onLang,
}: {
  profile: ProfileData;
  /**
   * Rendered inside the Studio: nothing is sent or tracked, links do not
   * navigate, and sheets stay inside the frame instead of the window.
   */
  preview?: boolean;
  /** The page's own ?p, ?code and ?t, carried into the contact file and leads. */
  query?: { p?: string; code?: string; t?: string };
  /** In the Studio: show the card in another of its languages. */
  onLang?: (lang: 'en' | 'ar') => void;
}) {
  const t = profileStrings(profile.lang);
  const dir = profile.lang === 'ar' ? 'rtl' : 'ltr';
  const [sheet, setSheet] = useState<'share' | 'exchange' | null>(null);
  const [saved, setSaved] = useState(false);
  const [gallery, setGallery] = useState<{ images: string[]; index: number } | null>(null);
  useSendKept(!preview);

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
  // The contact file follows the language on screen.
  if (profile.langs.length > 1) vq.set('lang', profile.lang);

  // The other language, as a link that keeps the rest of the address.
  const other = profile.langs.find((l) => l !== profile.lang);
  const langLink: LangLink = other
    ? {
        lang: other,
        href: `?${new URLSearchParams({ ...(query.p ? { p: query.p } : {}), ...(query.code ? { code: query.code } : {}), ...(query.t ? { t: query.t } : {}), lang: other })}`,
        onClick: preview
          ? (e) => {
              e.preventDefault();
              onLang?.(other);
            }
          : undefined,
      }
    : null;
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

  const metaItems: MetaItem[] = [];
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
      {/* In the Studio the card redraws as it is edited, so it does not animate. */}
      <div className={preview ? '' : 'p-rise'}>
        <Header profile={profile} t={t} meta={metaItems} onShare={() => setSheet('share')} lang={langLink} />
      </div>

      <div className={`px-5 pb-8 ${preview ? '' : 'p-rise'}`}>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <a
            href={vcardUrl}
            onClick={(e) => {
              if (preview) e.preventDefault();
              else track(profile.slug, 'SAVE');
              setSaved(true);
              setTimeout(() => setSaved(false), 2200);
            }}
            className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[var(--p-accent)] px-3 text-md font-medium text-[var(--p-on-accent)] transition-opacity active:opacity-85"
          >
            <Icon name={saved ? 'check' : 'user-plus'} size={17} />
            <span className="truncate">{saved ? t.saved : t.save}</span>
          </a>
          <button
            onClick={() => setSheet('exchange')}
            className="flex h-12 items-center justify-center gap-2 rounded-[12px] px-3 text-md font-medium ring-1 ring-inset ring-[var(--p-line-strong)] transition-colors active:bg-[var(--p-elevated)]"
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
                <span className="max-w-full truncate px-1 text-xs font-medium text-[var(--p-muted)]">{l.label}</span>
              </a>
            ))}
          </div>
        )}

        <WalletButtons profile={profile} t={t} query={vq.toString()} preview={preview} />

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
                      <span style={inkStyle(l.color, profile.mode)} className="p-ink flex">
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
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] px-4 text-md font-medium ring-1 ring-inset ring-[var(--p-line-strong)] transition-colors active:bg-[var(--p-elevated)]"
                    >
                      <span style={inkStyle(l.color, profile.mode)} className="p-ink flex shrink-0">
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
                        <span style={inkStyle(l.color, profile.mode)} className="p-ink flex">
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

        <footer className="mt-12 flex items-center justify-center gap-1.5 text-xs text-[var(--p-faint)]">
          {t.poweredBy}
          <a href="/" onClick={guard} className="v-hit flex items-center gap-1 font-medium text-[var(--p-muted)]">
            <VMark size={12} strokeWidth={3} />
            Vertex Connect
          </a>
        </footer>
      </div>
    </>
  );

  return (
    <div dir={dir} lang={profile.lang} style={profileStyle(profile)} {...profileAttrs(profile)} className={`relative bg-[var(--p-surface)] text-[var(--p-fg)] ${preview ? 'h-full overflow-hidden' : ''}`}>
      {preview ? <div className="no-scrollbar h-full overflow-y-auto overscroll-contain">{body}</div> : body}

      <BottomSheet open={sheet === 'share'} onClose={() => setSheet(null)} contained={preview} title={t.shareTitle} closeLabel={t.close}>
        <ShareBody slug={profile.slug} name={profile.name} t={t} preview={preview} />
      </BottomSheet>
      <BottomSheet open={sheet === 'exchange'} onClose={() => setSheet(null)} contained={preview} title={fill(t.exchangeTitle, { name: profile.name })} closeLabel={t.close}>
        <ExchangeBody profile={profile} t={t} preview={preview} tagUid={query.t} vcardUrl={vcardUrl} />
      </BottomSheet>

      {gallery && <Lightbox images={gallery.images} startIndex={gallery.index} onClose={() => setGallery(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Add the card to the phone's wallet. Each phone gets its own wallet (Apple on
 * an iPhone or Mac, Google on Android); anything else sees both. Decided after
 * load, since the server cannot know the device.
 */
function WalletButtons({ profile, t, query, preview }: { profile: ProfileData; t: ProfileStrings; query: string; preview: boolean }) {
  const [device, setDevice] = useState<'apple' | 'android' | 'other' | null>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    setDevice(/iPhone|iPad|iPod|Macintosh/.test(ua) ? 'apple' : /Android/.test(ua) ? 'android' : 'other');
  }, []);
  if (!device) return null;
  const apple = profile.wallet.apple && device !== 'android';
  const google = profile.wallet.google && device !== 'apple';
  if (!apple && !google) return null;

  const href = (kind: 'apple' | 'google') => `${API_URL}/c/${profile.slug}/wallet/${kind}${query ? `?${query}` : ''}`;
  const onClick = (e: React.MouseEvent, via: string) => {
    if (preview) return e.preventDefault();
    track(profile.slug, 'SAVE', { via });
  };
  const button = 'flex h-11 min-w-0 items-center justify-center gap-2 rounded-[12px] bg-[#0b0b0e] px-3 text-base font-medium text-white transition-opacity active:opacity-85';
  return (
    // One above the other: side by side, the names would be cut short.
    <div className="mt-2 flex flex-col gap-2">
      {apple && (
        <a href={href('apple')} onClick={(e) => onClick(e, 'apple-wallet')} className={button}>
          <Icon name="wallet" size={16} />
          <span className="truncate">{t.addToAppleWallet}</span>
        </a>
      )}
      {google && (
        <a href={href('google')} onClick={(e) => onClick(e, 'google-wallet')} rel="noreferrer" className={button}>
          <Icon name="wallet" size={16} />
          <span className="truncate">{t.addToGoogleWallet}</span>
        </a>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The top of the card: one of four layouts
 * ------------------------------------------------------------------------- */

function Header({ profile, t, meta, onShare, lang }: { profile: ProfileData; t: ProfileStrings; meta: MetaItem[]; onShare: () => void; lang: LangLink }) {
  switch (profile.layout) {
    case 'centered':
      return (
        <>
          <div className="relative h-[148px] overflow-hidden">
            <CoverArt profile={profile} />
            <CoverChrome profile={profile} t={t} onShare={onShare} lang={lang} />
          </div>
          <div className="flex flex-col items-center px-5 text-center">
            <div className="-mt-[52px]">
              <Avatar profile={profile} size={104} />
            </div>
            <Identity profile={profile} t={t} meta={meta} center />
          </div>
        </>
      );

    case 'spotlight': {
      // The photo is the cover; without one, the cover art with the initials.
      const photo = profile.avatar || profile.coverImage;
      return (
        <>
          <div className="relative h-[380px] overflow-hidden bg-[#0b0b0e]">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt={profile.avatar ? profile.name : ''} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <>
                <CoverArt profile={profile} />
                <span aria-hidden className="absolute inset-x-0 top-[26%] text-center text-[96px] font-semibold leading-none tracking-[-0.04em] text-white/25">
                  {initials(profile.name)}
                </span>
              </>
            )}
            <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/80 via-black/40 to-transparent" aria-hidden />
            <CoverChrome profile={profile} t={t} onShare={onShare} lang={lang} />
            <div className="absolute inset-x-0 bottom-0 px-5 pb-5 text-white">
              <Name profile={profile} t={t} className="text-4xl" />
              {profile.title && <p className="mt-1 text-md leading-snug text-white/80">{profile.title}</p>}
              <Company profile={profile} className="mt-2 text-white/90" />
            </div>
          </div>
          {meta.length > 0 && (
            <div className="px-5">
              <Meta items={meta} />
            </div>
          )}
        </>
      );
    }

    case 'minimal':
      return (
        <div className="px-5 pt-5">
          <div className="flex h-10 items-center justify-between gap-3">
            {profile.brand ? (
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--p-muted)]">
                <BrandMark brand={profile.brand} size={24} />
                <span className="truncate">{profile.brand.name}</span>
              </span>
            ) : profile.profileName ? (
              <span className="truncate text-sm font-medium text-[var(--p-muted)]">{profile.profileName}</span>
            ) : (
              <span />
            )}
            <div className="flex shrink-0 items-center gap-2">
              <LangSwitch lang={lang} className="text-[var(--p-muted)] ring-1 ring-inset ring-[var(--p-line-strong)] active:bg-[var(--p-elevated)]" />
              <button
                onClick={onShare}
                aria-label={t.share}
                title={t.share}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--p-muted)] ring-1 ring-inset ring-[var(--p-line-strong)] transition-colors active:bg-[var(--p-elevated)]"
              >
                <Icon name="share" size={16} />
              </button>
            </div>
          </div>
          <div className="mt-8 flex items-center gap-4">
            <Avatar profile={profile} size={76} ring={false} />
            <div className="min-w-0 flex-1">
              <Name profile={profile} t={t} className="text-3xl" />
              {profile.title && <p className="mt-0.5 text-base leading-snug text-[var(--p-muted)]">{profile.title}</p>}
            </div>
          </div>
          {/* Shown at the top already; here only when it is a different name. */}
          {profile.company && profile.company !== profile.brand?.name && <Company profile={profile} noLogo className="mt-3" />}
          <span className="mt-5 block h-[3px] w-10 rounded-full bg-[var(--p-accent)]" aria-hidden />
          <Meta items={meta} />
        </div>
      );

    default:
      return (
        <>
          <div className="relative h-[132px] overflow-hidden">
            <CoverArt profile={profile} />
            <CoverChrome profile={profile} t={t} onShare={onShare} lang={lang} />
          </div>
          <div className="px-5">
            <div className="-mt-11">
              <Avatar profile={profile} size={88} />
            </div>
            <Identity profile={profile} t={t} meta={meta} />
          </div>
        </>
      );
  }
}

/** Name, title, company and details, under the photo. */
function Identity({ profile, t, meta, center = false }: { profile: ProfileData; t: ProfileStrings; meta: MetaItem[]; center?: boolean }) {
  return (
    <div className={center ? 'flex flex-col items-center' : ''}>
      <Name profile={profile} t={t} className="mt-3 text-3xl" />
      {profile.title && <p className="mt-1 text-md leading-snug text-[var(--p-muted)]">{profile.title}</p>}
      <Company profile={profile} className="mt-2.5" />
      <Meta items={meta} center={center} />
    </div>
  );
}

function Name({ profile, t, className = '' }: { profile: ProfileData; t: ProfileStrings; className?: string }) {
  return (
    <h1 className={`flex items-center gap-1.5 font-semibold leading-tight tracking-[-0.02em] rtl:tracking-normal ${className}`}>
      <span className="min-w-0 break-words">{profile.name}</span>
      {profile.verified && (
        <span title={t.verified} className="shrink-0">
          <VerifiedBadge size={20} absolute={false} />
        </span>
      )}
    </h1>
  );
}

/** The company, with the workspace's logo beside it when there is one. */
function Company({ profile, className = '', noLogo = false }: { profile: ProfileData; className?: string; noLogo?: boolean }) {
  const name = profile.company || profile.brand?.name;
  if (!name) return null;
  const logo = !noLogo && profile.brand?.logo ? profile.brand : null;
  return (
    <p className={`flex min-w-0 items-center gap-2 text-base font-medium ${className}`}>
      {logo ? <BrandMark brand={logo} size={22} /> : <Icon name="briefcase" size={15} className="shrink-0 opacity-60" />}
      <span className="min-w-0 truncate">{name}</span>
    </p>
  );
}

function BrandMark({ brand, size }: { brand: { name: string; logo: string | null }; size: number }) {
  if (!brand.logo) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
        className="flex shrink-0 items-center justify-center rounded-[7px] bg-[var(--p-accent)] font-semibold text-[var(--p-on-accent)]"
      >
        {initials(brand.name)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brand.logo} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-[7px] bg-white object-contain ring-1 ring-inset ring-black/10" />
  );
}

function Meta({ items, center = false }: { items: MetaItem[]; center?: boolean }) {
  if (!items.length) return null;
  return (
    <ul className={`mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-sm text-[var(--p-muted)] ${center ? 'justify-center' : ''}`}>
      {items.map((m) => (
        <li key={m.key} className="flex items-center gap-1.5">
          {m.dot ? <span className="h-2 w-2 rounded-full bg-[#22a06b]" aria-hidden /> : <Icon name={m.icon!} size={14} className="text-[var(--p-faint)]" />}
          {/* One item, so the flex gap does not split a sentence. */}
          <span>{m.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** The cover's picture or pattern, filling its box. */
function CoverArt({ profile }: { profile: ProfileData }) {
  const a = profile.accent;
  if (profile.coverImage && profile.layout !== 'spotlight') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={profile.coverImage} alt="" className="absolute inset-0 h-full w-full object-cover" />;
  }
  switch (profile.coverStyle) {
    case 'constellation':
      return (
        <div className="absolute inset-0 bg-[#0b0b0e]">
          <Constellation className="absolute inset-0 h-full w-full opacity-70" />
          <div className="absolute inset-0" style={{ background: `radial-gradient(80% 120% at 85% 0%, ${a}40, transparent 70%)` }} />
        </div>
      );
    case 'solid':
      return <div className="absolute inset-0" style={{ background: a }} />;
    case 'mesh':
      // Soft light pooling from two corners.
      return (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(60% 90% at 12% 10%, ${shade(a, 45)}, transparent 70%), radial-gradient(70% 100% at 95% 100%, ${shade(a, -45)}, transparent 70%), ${a}`,
          }}
        />
      );
    case 'lines':
      return (
        <div
          className="absolute inset-0"
          style={{
            background: `repeating-linear-gradient(135deg, rgba(255,255,255,0.09) 0 1px, transparent 1px 14px), linear-gradient(160deg, ${shade(a, 10)}, ${shade(a, -30)})`,
          }}
        />
      );
    default:
      return <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${shade(a, 18)}, ${a} 45%, ${shade(a, -40)})` }} />;
  }
}

/** The profile tag and the share button, over a cover. */
function CoverChrome({ profile, t, onShare, lang }: { profile: ProfileData; t: ProfileStrings; onShare: () => void; lang: LangLink }) {
  return (
    <>
      {/* A soft floor so the share button and the tag read on any cover. */}
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/20 to-transparent" aria-hidden />
      {profile.profileName && (
        <span className="absolute start-4 top-4 flex h-8 max-w-[60%] items-center gap-1.5 rounded-full bg-black/30 px-3 text-xs font-medium text-white backdrop-blur-md">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white" aria-hidden />
          <span className="truncate">{profile.profileName}</span>
        </span>
      )}
      <div className="absolute end-4 top-4 flex items-center gap-2">
        <LangSwitch lang={lang} className="bg-black/30 text-white backdrop-blur-md active:bg-black/40" />
        <button
          onClick={onShare}
          aria-label={t.share}
          title={t.share}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition-colors active:bg-black/40"
        >
          <Icon name="share" size={17} />
        </button>
      </div>
    </>
  );
}

/** The card's other language, when it has one: where it is and how to name it. */
type LangLink = { lang: 'en' | 'ar'; href: string; onClick?: (e: React.MouseEvent) => void } | null;

/** "العربية" on the English card, "English" on the Arabic one. */
function LangSwitch({ lang, className }: { lang: LangLink; className: string }) {
  if (!lang) return null;
  const label = lang.lang === 'ar' ? 'العربية' : 'English';
  return (
    <a
      href={lang.href}
      onClick={lang.onClick}
      hrefLang={lang.lang}
      lang={lang.lang}
      dir={lang.lang === 'ar' ? 'rtl' : 'ltr'}
      className={`flex h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors ${className}`}
    >
      {label}
    </a>
  );
}

function Avatar({ profile, size, ring = true }: { profile: ProfileData; size: number; ring?: boolean }) {
  const shape = profile.circle ? 'rounded-full' : size > 80 ? 'rounded-[24px]' : 'rounded-[20px]';
  const text = initials(profile.name);
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden font-semibold tracking-[-0.02em] ${ring ? 'ring-4 ring-[var(--p-surface)]' : ''} ${shape}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * (text.length > 1 ? 0.34 : 0.4)),
        background: profile.avatar ? 'var(--p-elevated)' : `linear-gradient(145deg, ${shade(profile.accent, 12)}, ${shade(profile.accent, -22)})`,
        color: readableOn(profile.accent),
      }}
    >
      {profile.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar} alt={profile.name} className="h-full w-full object-cover" />
      ) : (
        text
      )}
    </span>
  );
}

function Block({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      {title && <h2 className="mb-2.5 text-sm font-medium text-[var(--p-faint)]">{title}</h2>}
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
          <span className="block truncate text-md font-medium">{label}</span>
          {sub && (
            <span dir={plainSub ? undefined : 'ltr'} className={`block truncate text-sm text-[var(--p-faint)] ${plainSub ? '' : 'text-start rtl:text-right'}`}>
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
      <p dir="auto" className={`whitespace-pre-line text-md leading-[1.6] ${!open && long ? 'line-clamp-4' : ''}`}>{text}</p>
      {long && (
        <button onClick={() => setOpen((o) => !o)} className="mt-1.5 min-h-[44px] text-base font-medium text-[var(--p-accent)]">
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

  if (section.type === 'CREDENTIALS') {
    const items = (Array.isArray(section.content.items) ? section.content.items : []).filter(
      (x): x is { name: string; issuer?: string; year?: string } => !!x && typeof x === 'object' && typeof (x as { name?: unknown }).name === 'string' && !!(x as { name: string }).name.trim(),
    );
    if (!items.length) return null;
    return (
      <Block title={title ?? t.credentials}>
        <List>
          {items.map((c, i) => (
            <li key={`${c.name}-${i}`} className="flex min-h-[60px] items-center gap-3 px-3.5 py-2.5">
              <Tile>
                <Icon name="award" size={18} className="text-[var(--p-accent)]" />
              </Tile>
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block text-md font-medium leading-snug">{c.name}</span>
                {(c.issuer || c.year) && (
                  <span dir="auto" className="block text-sm text-[var(--p-faint)]">
                    {[c.issuer, c.year].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
            </li>
          ))}
        </List>
      </Block>
    );
  }

  if (section.type === 'CLIENTS') {
    const logos = Array.isArray(section.content.logos) ? (section.content.logos as unknown[]).filter((x): x is string => typeof x === 'string' && !!x) : [];
    if (!logos.length) return null;
    return (
      <Block title={title ?? t.clients}>
        <ul className="grid grid-cols-3 gap-2">
          {logos.map((src, i) => (
            <li key={`${src}-${i}`} className="flex aspect-[3/2] items-center justify-center rounded-[12px] bg-white p-3 ring-1 ring-inset ring-black/[0.06]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
            </li>
          ))}
        </ul>
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
      {pick(section.content, 'subtitle') && <p className="mb-1.5 text-md font-medium">{pick(section.content, 'subtitle')}</p>}
      <p dir="auto" className="whitespace-pre-line text-md leading-[1.6] text-[var(--p-muted)]">{text}</p>
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

  // Kept on screen while it slides away, then removed (see .p-sheet in globals.css).
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) {
      setShown(true);
      return;
    }
    const timer = setTimeout(() => setShown(false), SHEET_OUT_MS);
    return () => clearTimeout(timer);
  }, [open]);
  if (!shown) return null;

  const pos = contained ? 'absolute' : 'fixed';
  const closing = open ? undefined : '';
  return (
    <>
      <div onClick={onClose} data-closing={closing} className={`p-scrim ${pos} inset-0 z-40 bg-black/40`} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-closing={closing}
        className={`p-sheet ${pos} inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88%] w-full max-w-[440px] flex-col rounded-t-[20px] bg-[var(--p-surface)] text-[var(--p-fg)] shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.35)] ${
          contained ? '' : 'max-h-[88dvh] pb-[env(safe-area-inset-bottom)]'
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--p-line-strong)]" aria-hidden />
        <div className="flex items-start gap-3 px-5 pb-2 pt-3">
          <h2 className="min-w-0 flex-1 text-lg font-semibold leading-snug">{title}</h2>
          <button onClick={onClose} aria-label={closeLabel} className="-m-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--p-muted)] active:bg-[var(--p-elevated)]">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">{children}</div>
      </div>
    </>
  );
}

/** How long a sheet takes to slide away; matches p-sheet-out. */
const SHEET_OUT_MS = 200;

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
      <p className="text-base text-[var(--p-muted)]">{t.shareHint}</p>
      <div className="mx-auto mt-4 w-fit rounded-[16px] bg-white p-3 ring-1 ring-inset ring-black/5">
        <QRCode value={url || `/c/${slug}`} size={196} />
      </div>
      <p dir="ltr" className="mx-auto mt-3 max-w-full truncate font-mono text-xs text-[var(--p-faint)]">
        {url.replace(/^https?:\/\//, '')}
      </p>
      <div className={`mt-5 grid gap-2 ${canShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <button onClick={copy} className="flex h-12 items-center justify-center gap-2 rounded-[12px] text-md font-medium ring-1 ring-inset ring-[var(--p-line-strong)] active:bg-[var(--p-elevated)]">
          <Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? t.linkCopied : t.copyLink}
        </button>
        {canShare && (
          <button onClick={share} className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[var(--p-accent)] text-md font-medium text-[var(--p-on-accent)] active:opacity-85">
            <Icon name="share" size={16} /> {t.shareVia}
          </button>
        )}
      </div>
    </div>
  );
}

type Intent = 'CONTACT' | 'MEETING' | 'QUOTE';

/** The open meeting times the server offers, in the owner's time zone. */
type Availability = { enabled: boolean; timezone: string; length: number; days: { date: string; slots: { time: string; at: string }[] }[] };

/** "Africa/Cairo" at an instant → "Cairo (GMT+3)". */
function zoneLabel(tz: string, at: Date): string {
  const city = tz.split('/').pop()!.replace(/_/g, ' ');
  const offset = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? '';
  return offset ? `${city} (${offset})` : city;
}

/**
 * A visitor at a fair often has no signal. What they send then is kept on
 * their phone and sent once it is back (on the next card page, or the moment
 * the connection returns). The API takes the same details twice as one lead,
 * so a send that did arrive the first time is not doubled. A meeting time
 * someone else took meanwhile goes as a contact request naming that time, so
 * the details still reach the owner.
 */
const KEPT = 'vx_card_outbox';

function keepForLater(body: string) {
  try {
    const list = JSON.parse(localStorage.getItem(KEPT) || '[]') as string[];
    localStorage.setItem(KEPT, JSON.stringify([...list, body]));
  } catch {
    /* no storage: nothing can be kept */
  }
}

let sendingKept = false;
async function sendKept() {
  if (sendingKept || typeof navigator === 'undefined' || navigator.onLine === false) return;
  let list: string[];
  try {
    list = JSON.parse(localStorage.getItem(KEPT) || '[]') as string[];
  } catch {
    return;
  }
  if (!list.length) return;
  sendingKept = true;
  const post = (body: string) => fetch(`${API_URL}/leads/capture`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  try {
    while (list.length) {
      let res = await post(list[0]);
      if (res.status === 409) {
        const d = JSON.parse(list[0]) as { meetingAt?: string; note?: string };
        const asked = d.meetingAt ? `Asked for a meeting at ${d.meetingAt}.` : '';
        res = await post(JSON.stringify({ ...d, intent: 'CONTACT', meetingAt: undefined, note: [d.note, asked].filter(Boolean).join(' ') }));
      }
      // Try again later when the API is busy or limiting; anything else is settled.
      if (res.status === 429 || res.status >= 500) break;
      list = list.slice(1);
      localStorage.setItem(KEPT, JSON.stringify(list));
    }
  } catch {
    /* still no connection: stays kept */
  } finally {
    if (!list.length) localStorage.removeItem(KEPT);
    sendingKept = false;
  }
}

/** Sends whatever this phone kept from an earlier card visit, now and when the connection returns. */
function useSendKept(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    void sendKept();
    const onOnline = () => void sendKept();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [enabled]);
}

/** The line under a card-form field that says what is wrong, in the card's own colours. */
function FormProblem({ id, text }: { id: string; text: string }) {
  if (!text) return null;
  return (
    <p id={id} className="-mt-1 px-1 text-sm text-[#d4453a]">
      {text}
    </p>
  );
}

function ExchangeBody({ profile, t, preview, tagUid, vcardUrl }: { profile: ProfileData; t: ProfileStrings; preview: boolean; tagUid?: string; vcardUrl: string }) {
  const [intent, setIntent] = useState<Intent>('CONTACT');
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', note: '', website: '' });
  const [date, setDate] = useState('');
  // The chosen slot's instant.
  const [slot, setSlot] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Intent | null>(null);
  // Sent while there was no signal: kept on this phone until it goes out.
  const [kept, setKept] = useState(false);
  // null while loading; a failed load reads as "no times".
  const [times, setTimes] = useState<Availability | null>(null);
  const [visitorZone, setVisitorZone] = useState('');
  const locale = profile.lang === 'ar' ? 'ar-EG' : 'en-GB';

  const loadTimes = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/c/${profile.slug}/availability`);
      if (!res.ok) throw new Error();
      const a = (await res.json()) as Availability;
      setTimes(a);
      setDate((d) => (a.days.some((x) => x.date === d) ? d : a.days[0]?.date ?? ''));
    } catch {
      setTimes({ enabled: true, timezone: 'UTC', length: 30, days: [] });
    }
  }, [profile.slug]);

  useEffect(() => {
    void loadTimes();
    setVisitorZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, [loadTimes]);
  const intents = (['CONTACT', 'MEETING', 'QUOTE'] as const).filter((i) => i !== 'MEETING' || times?.enabled !== false);
  const day = times?.days.find((d) => d.date === date);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Checked as the visitor types, under each field, in the card's language.
  const digits = form.phone.replace(/\D/g, '').length;
  const checks = useChecks({
    name: form.name.trim() ? null : 'required',
    email: form.email.trim() && !isEmail(form.email) ? 'email' : null,
    phone: form.phone.trim() && (digits < 7 || !/^[+\d\s().-]+$/.test(form.phone.trim())) ? 'phone' : null,
    contact: !form.email.trim() && !form.phone.trim() ? 'oneOf' : null,
    note: intent === 'QUOTE' && !form.note.trim() ? 'required' : null,
  });
  const words = { name: t.nameNeeded, email: t.emailWrong, phone: t.phoneWrong, contact: t.needContact, note: t.noteNeeded };
  const problem = (k: keyof typeof words) => (checks.shown(k) ? words[k] : '');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!checks.check()) return;
    if (preview) {
      setDone(intent);
      return;
    }
    setBusy(true);
    const body = JSON.stringify({
      slug: profile.slug,
      intent,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      company: form.company.trim() || undefined,
      note: form.note.trim() || undefined,
      meetingAt: intent === 'MEETING' && slot ? slot : undefined,
      visitorId: visitorId(),
      // The chip this visitor tapped, so the lead is credited to it.
      tagUid,
      // The hidden field: empty from a person, filled by a bot.
      website: form.website || undefined,
    });
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new TypeError('offline');
      const res = await fetch(`${API_URL}/leads/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res.status === 429) throw new Error(t.tooMany);
      if (res.status === 409) {
        // Someone else took the time a moment ago: show what is left.
        setSlot('');
        void loadTimes();
        throw new Error(t.slotTaken);
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = (Array.isArray(data?.errors) && data.errors[0]?.message) || data?.message;
        if (!message) throw new Error(t.failed);
        // Loaded only when a send is refused, so the card itself stays light.
        const { apiErrorText } = await import('@/lib/apiErrors');
        throw new Error(apiErrorText(message, [], profile.lang === 'ar' ? 'ar' : 'en'));
      }
      setDone(intent);
    } catch (err) {
      // No signal (common at a fair): keep the details on this phone and send them once it is back.
      if (err instanceof TypeError) {
        keepForLater(body);
        setKept(true);
        setDone(intent);
      } else setError(err instanceof TypeError ? t.failed : (err as Error).message);
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
        <p className="mt-4 text-lg font-semibold">{kept ? t.keptTitle : t.done[done]}</p>
        <p className="mt-1 text-base text-[var(--p-muted)]">{fill(kept ? t.keptOffline : t.doneHint, { name: profile.name })}</p>
        {/* The exchange goes both ways: now keep their number too. */}
        <a
          href={vcardUrl}
          onClick={(e) => {
            if (preview) e.preventDefault();
            else track(profile.slug, 'SAVE');
          }}
          className="mx-auto mt-6 flex h-12 max-w-[320px] items-center justify-center gap-2 rounded-[12px] bg-[var(--p-elevated)] px-4 text-md font-medium text-[var(--p-fg)] ring-1 ring-inset ring-[var(--p-line)] transition-opacity active:opacity-85"
        >
          <Icon name="user-plus" size={17} />
          <span className="truncate">{fill(t.saveBack, { name: profile.name })}</span>
        </a>
        {preview && <p className="mt-3 text-xs text-[var(--p-faint)]">{t.previewOnly}</p>}
      </div>
    );
  }

  const field = 'h-12 w-full rounded-[12px] bg-[var(--p-elevated)] px-3.5 text-lg text-[var(--p-fg)] outline-none ring-1 ring-inset ring-transparent placeholder:text-[var(--p-faint)] focus:ring-[var(--p-accent)] aria-[invalid=true]:ring-[#d4453a]';

  return (
    <form onSubmit={submit} noValidate className="space-y-2.5">
      <p className="text-base text-[var(--p-muted)]">{t.exchangeHint}</p>
      <div role="radiogroup" className="flex rounded-[12px] bg-[var(--p-elevated)] p-1">
        {intents.map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={intent === i}
            onClick={() => {
              setIntent(i);
              setError('');
            }}
            className={`h-10 flex-1 rounded-[9px] text-base font-medium transition-colors ${intent === i ? 'bg-[var(--p-surface)] text-[var(--p-fg)] shadow-sm' : 'text-[var(--p-muted)]'}`}
          >
            {t.intents[i]}
          </button>
        ))}
      </div>

      {/* A trap for bots: out of sight and out of the tab order, so a person never fills it. */}
      <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} name="website" />
        </label>
      </div>
      <input className={field} placeholder={t.fullName} value={form.name} onChange={set('name')} autoComplete="name" aria-label={t.fullName} {...checks.bind('name', 'xf-name')} />
      <FormProblem id="xf-name" text={problem('name')} />
      <input className={field} type="email" dir="ltr" placeholder={t.email} value={form.email} onChange={set('email')} autoComplete="email" aria-label={t.email} style={{ textAlign: profile.lang === 'ar' ? 'right' : 'left' }} {...checks.bind('email', 'xf-email')} />
      <FormProblem id="xf-email" text={problem('email')} />
      <input className={field} type="tel" dir="ltr" placeholder={t.phone} value={form.phone} onChange={set('phone')} autoComplete="tel" aria-label={t.phone} style={{ textAlign: profile.lang === 'ar' ? 'right' : 'left' }} {...checks.bind('phone', 'xf-phone')} />
      <FormProblem id="xf-phone" text={problem('phone') || problem('contact')} />
      <input className={field} placeholder={`${t.company} (${t.optional})`} value={form.company} onChange={set('company')} autoComplete="organization" aria-label={t.company} />

      {intent === 'MEETING' && (
        <div className="space-y-2.5 pt-1">
          {!times ? (
            <p className="flex h-24 items-center justify-center gap-2 text-sm text-[var(--p-muted)]">
              <Icon name="loader" size={15} className="animate-spin" /> {t.loadingTimes}
            </p>
          ) : times.days.length === 0 ? (
            <p className="rounded-[12px] bg-[var(--p-elevated)] px-3.5 py-3 text-sm leading-snug text-[var(--p-muted)]">{fill(t.noTimes, { name: profile.name })}</p>
          ) : (
            <>
              <div>
                <span className="mb-1.5 block text-sm text-[var(--p-muted)]">{t.pickDay}</span>
                {/* Two weeks of working days, scrolled sideways. */}
                <div role="radiogroup" aria-label={t.pickDay} className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 pb-0.5">
                  {times.days.map((d) => {
                    const at = new Date(`${d.date}T12:00:00Z`);
                    const on = d.date === date;
                    return (
                      <button
                        key={d.date}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => {
                          setDate(d.date);
                          setSlot('');
                        }}
                        className={`flex h-[58px] w-[52px] shrink-0 flex-col items-center justify-center rounded-[12px] ${on ? 'bg-[var(--p-accent)] text-[var(--p-on-accent)]' : 'bg-[var(--p-elevated)] text-[var(--p-fg)]'}`}
                      >
                        <span className={`text-2xs ${on ? '' : 'text-[var(--p-muted)]'}`}>{new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(at)}</span>
                        <span className="text-lg font-semibold tabular-nums">{new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' }).format(at)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {day && (
                <div>
                  <span className="mb-1.5 block text-sm text-[var(--p-muted)]">
                    {new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day.date}T12:00:00Z`))}
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {day.slots.map((s) => (
                      <button
                        key={s.at}
                        type="button"
                        onClick={() => setSlot(s.at)}
                        aria-pressed={slot === s.at}
                        className={`h-11 rounded-[10px] text-base tabular-nums ${slot === s.at ? 'bg-[var(--p-accent)] text-[var(--p-on-accent)]' : 'bg-[var(--p-elevated)] text-[var(--p-fg)]'}`}
                      >
                        {new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: times.timezone }).format(new Date(s.at))}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs leading-snug text-[var(--p-faint)]">
                {fill(t.timesIn, { zone: zoneLabel(times.timezone, new Date(slot || Date.now())), length: String(times.length) })}
                {/* A visitor elsewhere sees the time on their own clock too. */}
                {slot && visitorZone && visitorZone !== times.timezone && (
                  <>
                    {' '}
                    {fill(t.yourTime, {
                      time: new Intl.DateTimeFormat(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: visitorZone }).format(new Date(slot)),
                    })}
                  </>
                )}
              </p>
            </>
          )}
        </div>
      )}

      {intent !== 'CONTACT' && (
        <textarea
          rows={3}
          className={`${field} h-auto resize-none py-3`}
          placeholder={intent === 'QUOTE' ? t.quoteNote : `${t.note} (${t.optional})`}
          value={form.note}
          onChange={set('note')}
          aria-label={t.note}
          {...checks.bind('note', 'xf-note')}
        />
      )}
      {intent !== 'CONTACT' && (
        <FormProblem id="xf-note" text={problem('note')} />
      )}

      {error && <p role="alert" className="text-sm text-[#d4453a]">{error}</p>}

      <p className="flex items-start gap-2 pt-1 text-xs leading-snug text-[var(--p-faint)]">
        <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
        <span>
          {fill(t.privacy, { name: profile.name })}
          {profile.privacyUrl && (
            <>
              {' '}
              <a href={profile.privacyUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" onClick={(e) => preview && e.preventDefault()}>
                {t.privacyLink}
              </a>
            </>
          )}
        </span>
      </p>

      <button type="submit" disabled={busy || (intent === 'MEETING' && !slot)} className="mt-1 flex h-12 w-full items-center justify-center rounded-[12px] bg-[var(--p-accent)] text-md font-medium text-[var(--p-on-accent)] disabled:opacity-50">
        {busy ? t.sending : t.send[intent]}
      </button>
    </form>
  );
}

