import { headers } from 'next/headers';
import { ImageResponse } from 'next/og';
import { apiGet, forwardedFor, type PublicCard, type PublicCardLocked } from '@/lib/api';
import { buildProfile, initials } from '@/lib/profile';
import { readableOn, shade } from '@/lib/color';

export const runtime = 'edge';
export const alt = 'Vertex Connect card';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The fonts ship with the app (assets/fonts), so Arabic names draw correctly
 * without a request to a font service. Loaded on first use: the page imports
 * this file for its metadata too, where they are not needed.
 */
let fontData: Promise<[ArrayBuffer, ArrayBuffer]> | null = null;
function loadFonts() {
  fontData ??= Promise.all([
    fetch(new URL('../../../assets/fonts/IBMPlexSansArabic-Regular.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('../../../assets/fonts/IBMPlexSansArabic-SemiBold.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
  ]);
  return fontData;
}

/**
 * A photo as a data URL, or null. Fetched here, with a time limit, so a slow
 * or broken photo leaves the initials instead of failing the whole preview.
 */
async function photo(url: string): Promise<string | null> {
  if (!/^https?:\/\//.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/^image\/(jpe?g|png)$/.test(type)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 2 * 1024 * 1024) return null;
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

const ARABIC = /[\u0600-\u06FF]/;

/**
 * A line of text in its reading order. The image renderer measures each word
 * on its own, before Arabic letters join, and lays the words out left to
 * right; joined by non-breaking spaces, an Arabic line stays one piece, which
 * it measures and orders right. Meant for short, one-line text.
 */
function Line({ text, style }: { text: string; style: React.CSSProperties }) {
  const shown = ARABIC.test(text) ? text.trim().split(/\s+/).join('\u00a0') : text;
  return <div style={{ display: 'flex', ...style }}>{shown}</div>;
}

/** The picture a messaging app shows when someone sends this card's link. */
export default async function OpenGraphImage({ params }: { params: { slug: string } }) {
  const [regular, semibold] = await loadFonts();
  const fonts = [
    { name: 'Plex', data: regular, weight: 400 as const },
    { name: 'Plex', data: semibold, weight: 600 as const },
  ];
  const result = await apiGet<PublicCard | PublicCardLocked>(`/c/${params.slug}`, forwardedFor(headers()));

  // A missing or private card still gets a tidy picture, with nothing about it.
  if (!result || ('locked' in result && result.locked)) {
    return new ImageResponse(
      (
        <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: '#f5f4f1', fontFamily: 'Plex', fontSize: 56, fontWeight: 600, color: '#17171a' }}>
          Vertex Connect
        </div>
      ),
      { ...size, fonts },
    );
  }

  const card = result as PublicCard;
  const p = buildProfile({ ...card, brand: card.brand ?? null });
  const dark = p.mode === 'dark';
  const fg = dark ? '#ededee' : '#17171a';
  const muted = dark ? '#a1a1a8' : '#5e5d63';
  const [avatar, logo] = await Promise.all([p.avatar ? photo(p.avatar) : null, p.brand?.logo ? photo(p.brand.logo) : null]);
  const company = p.company || p.brand?.name || '';

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          height: '100%',
          background: dark ? '#141416' : '#ffffff',
          fontFamily: 'Plex',
          color: fg,
        }}
      >
        {/* The card's colour, with the photo or initials on it. */}
        <div
          style={{
            display: 'flex',
            width: 440,
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            background: `linear-gradient(160deg, ${shade(p.accent, 24)}, ${p.accent} 50%, ${shade(p.accent, -44)})`,
          }}
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} width={260} height={260} style={{ borderRadius: p.circle ? 130 : 48, objectFit: 'cover', border: '8px solid rgba(255,255,255,0.9)' }} alt="" />
          ) : (
            <div
              style={{
                display: 'flex',
                width: 260,
                height: 260,
                borderRadius: p.circle ? 130 : 48,
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.16)',
                border: '8px solid rgba(255,255,255,0.35)',
                fontSize: 104,
                fontWeight: 600,
                color: readableOn(p.accent),
              }}
            >
              {initials(p.name)}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '72px 72px 56px',
            // Start-aligned in both languages: the renderer measures an Arabic
            // line with ligatures wider than it draws it, so right-aligned
            // Arabic lines would not line up.
            alignItems: 'flex-start',
          }}
        >
          <Line text={p.name} style={{ fontSize: p.name.length > 22 ? 58 : 70, fontWeight: 600, lineHeight: 1.15, letterSpacing: ARABIC.test(p.name) ? 0 : -1.5 }} />
          {p.title && <Line text={p.title} style={{ marginTop: 18, fontSize: 34, color: muted }} />}
          {company && (
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 30, fontSize: 30, fontWeight: 600 }}>
              {logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} width={44} height={44} style={{ borderRadius: 10, objectFit: 'contain', background: '#fff', marginRight: 16 }} alt="" />
              )}
              <Line text={company} style={{ fontSize: 30 }} />
            </div>
          )}
          <div style={{ display: 'flex', flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 24, color: muted }}>
            <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, background: p.accent, marginRight: 12 }} />
            Vertex Connect
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
