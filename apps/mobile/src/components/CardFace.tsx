import { Image, StyleSheet, Text as RNText, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { lightness, type Cover, type Identity, type Look } from '@/lib/card-editor';
import { fonts } from '@/lib/theme';

/** The public card's own surfaces (apps/web/lib/profile.ts PALETTE), not the app's. */
const SURFACE = {
  light: { bg: '#FFFFFF', ink: '#18181B', muted: '#56555B', line: 'rgba(0,0,0,0.08)' },
  dark: { bg: '#141416', ink: '#EDEDEF', muted: '#A1A1A8', line: 'rgba(255,255,255,0.1)' },
};

// Fixed stars, so the night sky does not move between renders.
const STARS = [
  [8, 22, 1.2], [17, 64, 0.9], [26, 38, 1.4], [34, 80, 1], [43, 18, 0.8], [51, 56, 1.3], [60, 30, 1],
  [68, 72, 0.9], [76, 44, 1.5], [85, 20, 1], [92, 62, 1.2], [12, 88, 0.8], [57, 90, 1], [97, 34, 0.9],
] as const;

/** A cover style drawn in the card's colour (apps/web/components/profile, as near as a phone draws it). */
export function CoverArt({ cover, accent, id }: { cover: Cover; accent: string; id: string }) {
  // Ids are per card, so two covers on one screen do not share a gradient.
  const g = `g-${id}`;
  return (
    // In percentages rather than a stretched view box, so the stars stay round on any width.
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={`${g}-lin`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={accent} stopOpacity="1" />
          <Stop offset="1" stopColor={accent} stopOpacity="0.45" />
        </LinearGradient>
        <RadialGradient id={`${g}-glow`} cx="0.8" cy="0.2" r="0.7">
          <Stop offset="0" stopColor={accent} stopOpacity="0.55" />
          <Stop offset="1" stopColor={accent} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id={`${g}-m1`} cx="0.15" cy="0.1" r="0.6">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id={`${g}-m2`} cx="0.9" cy="0.95" r="0.6">
          <Stop offset="0" stopColor="#000000" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {cover === 'gradient' && <Rect width="100%" height="100%" fill={`url(#${g}-lin)`} />}
      {cover === 'solid' && <Rect width="100%" height="100%" fill={accent} />}
      {cover === 'constellation' && (
        <>
          <Rect width="100%" height="100%" fill="#0B0B12" />
          <Rect width="100%" height="100%" fill={`url(#${g}-glow)`} />
          {STARS.map(([x, y, r]) => (
            <Circle key={`${x}-${y}`} cx={`${x}%`} cy={`${y}%`} r={r * 1.1} fill="#ffffff" opacity={0.8} />
          ))}
        </>
      )}
      {cover === 'mesh' && (
        <>
          <Rect width="100%" height="100%" fill={accent} />
          <Rect width="100%" height="100%" fill={`url(#${g}-m1)`} />
          <Rect width="100%" height="100%" fill={`url(#${g}-m2)`} />
        </>
      )}
      {cover === 'lines' && (
        <>
          <Rect width="100%" height="100%" fill={accent} opacity={0.14} />
          {Array.from({ length: 14 }, (_, i) => (
            <Line key={i} x1={`${i * 10 - 40}%`} y1="100%" x2={`${i * 10}%`} y2="0%" stroke={accent} strokeWidth="1.2" opacity={0.6} />
          ))}
        </>
      )}
    </Svg>
  );
}

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

/**
 * The top of a card as its visitors see it: the cover, the photo, the name and
 * what they do, in the card's colours. Drawn here (not the website's page), so
 * it follows what is being typed before it is saved.
 */
export function CardFace({
  id,
  look,
  identity,
  fallbackName,
  size = 'tile',
}: {
  id: string;
  look: Pick<Look, 'accent' | 'mode' | 'cover' | 'layout'>;
  identity: Pick<Identity, 'fullName' | 'title' | 'company' | 'avatar' | 'coverImage'>;
  fallbackName: string;
  size?: 'tile' | 'hero';
}) {
  const s = SURFACE[look.mode === 'dark' ? 'dark' : 'light'];
  const hero = size === 'hero';
  const coverH = hero ? 112 : 76;
  const avatar = hero ? 84 : 56;
  const centered = look.layout === 'centered' || look.layout === 'spotlight';
  const name = identity.fullName.trim() || fallbackName;
  const line = [identity.title.trim(), identity.company.trim()].filter(Boolean).join(' · ');
  const onAccent = lightness(look.accent) > 0.6 ? '#18181B' : '#FFFFFF';

  return (
    <View style={{ backgroundColor: s.bg, borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: s.line }}>
      <View style={{ height: coverH }}>
        {identity.coverImage ? (
          <Image source={{ uri: identity.coverImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <CoverArt cover={look.cover} accent={look.accent} id={id} />
        )}
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: hero ? 18 : 14, alignItems: centered ? 'center' : 'flex-start' }}>
        <View
          style={{
            width: avatar + 6,
            height: avatar + 6,
            borderRadius: (avatar + 6) / 2,
            marginTop: -(avatar / 2),
            backgroundColor: s.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {identity.avatar ? (
            <Image source={{ uri: identity.avatar }} style={{ width: avatar, height: avatar, borderRadius: avatar / 2 }} />
          ) : (
            <View style={{ width: avatar, height: avatar, borderRadius: avatar / 2, backgroundColor: look.accent, alignItems: 'center', justifyContent: 'center' }}>
              <RNText style={{ color: onAccent, fontFamily: fonts.semibold, fontSize: avatar * 0.36 }}>{initialsOf(name)}</RNText>
            </View>
          )}
        </View>
        <RNText
          numberOfLines={1}
          style={{ color: s.ink, fontFamily: fonts.bold, fontSize: hero ? 20 : 16, lineHeight: hero ? 27 : 22, marginTop: 8, textAlign: centered ? 'center' : 'auto' }}
        >
          {name}
        </RNText>
        {line ? (
          <RNText numberOfLines={2} style={{ color: s.muted, fontFamily: fonts.regular, fontSize: hero ? 14 : 13, lineHeight: hero ? 20 : 18, textAlign: centered ? 'center' : 'auto' }}>
            {line}
          </RNText>
        ) : null}
      </View>
    </View>
  );
}
