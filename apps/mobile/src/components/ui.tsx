import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { PATHS } from './icon-paths';
import { fonts, radius, useColors } from '@/lib/theme';
import { currentLang } from '@/lib/i18n';

// ---------------------------------------------------------------- icon

export function Icon({ name, size = 20, color }: { name: string; size?: number; color?: string }) {
  const c = useColors();
  return (
    <Svg width={size} height={size} style={{ flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke={color ?? c.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d={PATHS[name] ?? PATHS.link} />
    </Svg>
  );
}

/** The "go on" chevron, pointing the way the language reads. */
export function Forward({ color, size = 16 }: { color?: string; size?: number }) {
  return (
    <View style={{ transform: [{ scaleX: currentLang() === 'ar' ? -1 : 1 }] }}>
      <Icon name="chevron-right" size={size} color={color} />
    </View>
  );
}

// ---------------------------------------------------------------- text

type Tone = 'ink' | 'muted' | 'faint' | 'accent' | 'danger' | 'success' | 'warning' | 'onAccent';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
const SIZES: Record<Size, [number, number]> = { xs: [12, 16], sm: [13, 19], md: [15, 22], lg: [17, 24], xl: [22, 29], xxl: [28, 35] };

export function Text({
  size = 'md',
  tone = 'ink',
  weight = 'regular',
  style,
  ...rest
}: TextProps & { size?: Size; tone?: Tone; weight?: keyof typeof fonts }) {
  const c = useColors();
  const color = tone === 'accent' ? c.accentText : tone === 'onAccent' ? c.onAccent : c[tone];
  const [fontSize, lineHeight] = SIZES[size];
  return <RNText {...rest} style={[{ color, fontSize, lineHeight, fontFamily: fonts[weight], textAlign: 'auto', writingDirection: 'auto' }, style]} />;
}

// ---------------------------------------------------------------- layout

/** A screen: the canvas, inside the safe area, scrolling when it is long. */
export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  refreshControl,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  refreshControl?: ScrollViewProps['refreshControl'];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.canvas }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: 32, gap: 16 }, contentStyle]} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** A white sheet on the canvas, as the web's cards. */
export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const c = useColors();
  return <View style={[{ backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong, overflow: 'hidden' }, padded && { padding: 16 }, style]}>{children}</View>;
}

export function Row({ children, gap = 8, style, align = 'center' }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; align?: ViewStyle['alignItems'] }) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]}>{children}</View>;
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4 }}>
      <Text size="sm" weight="semibold" tone="muted">
        {children}
      </Text>
      {action}
    </Row>
  );
}

// ---------------------------------------------------------------- controls

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  busy = false,
  disabled = false,
  style,
  testID,
  small = false,
}: {
  label: string;
  onPress?: PressableProps['onPress'];
  kind?: ButtonKind;
  icon?: string;
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  small?: boolean;
}) {
  const c = useColors();
  const bg = kind === 'primary' ? c.accent : kind === 'danger' ? c.dangerSoft : kind === 'secondary' ? c.surface : 'transparent';
  const fg = kind === 'primary' ? c.onAccent : kind === 'danger' ? c.danger : kind === 'ghost' ? c.accentText : c.ink;
  const off = disabled || busy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        {
          minHeight: small ? 36 : 48,
          paddingHorizontal: small ? 12 : 16,
          borderRadius: radius.md,
          backgroundColor: bg,
          borderWidth: kind === 'secondary' ? StyleSheet.hairlineWidth : 0,
          borderColor: c.lineStrong,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: off ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={small ? 15 : 17} color={fg} /> : null}
      <RNText style={{ color: fg, fontFamily: fonts.semibold, fontSize: small ? 13 : 15 }}>{label}</RNText>
    </Pressable>
  );
}

export const Field = forwardRef<TextInput, TextInputProps & { label: string; hint?: string; error?: string | null }>(function Field({ label, hint, error, style, ...rest }, ref) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text size="sm" weight="medium">
        {label}
      </Text>
      <TextInput
        ref={ref}
        placeholderTextColor={c.faint}
        accessibilityLabel={label}
        {...rest}
        style={[
          {
            minHeight: 48,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: error ? c.danger : c.lineStrong,
            backgroundColor: c.surface,
            paddingHorizontal: 14,
            color: c.ink,
            fontFamily: fonts.regular,
            fontSize: 16,
            textAlign: rest.keyboardType === 'email-address' || rest.secureTextEntry ? 'left' : 'auto',
          } as TextStyle,
          style,
        ]}
      />
      {error ? (
        <Text size="xs" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text size="xs" tone="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

/** A row in a list: an icon or avatar, a title and a line under it, and where it leads. */
export function ListItem({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  testID,
}: {
  title: string;
  subtitle?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const c = useColors();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => ({ backgroundColor: pressed && onPress ? c.elevated : 'transparent' })}>
      <Row gap={12} style={{ paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 }}>
        {leading}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text weight="medium" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text size="sm" tone="muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing ?? (onPress ? <Forward color={c.faint} /> : null)}
      </Row>
    </Pressable>
  );
}

/** Initials on a colour from the name, as the web's avatars. */
export function Avatar({ name, size = 40 }: { name: string | null | undefined; size?: number }) {
  const label = (name ?? '?').trim();
  const initials =
    label
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?';
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) % 360;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${h}, 55%, 42%)`, alignItems: 'center', justifyContent: 'center' }}>
      <RNText style={{ color: '#fff', fontFamily: fonts.semibold, fontSize: size * 0.36 }}>{initials}</RNText>
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }) {
  const c = useColors();
  const map = {
    neutral: [c.elevated, c.muted],
    accent: [c.accentSoft, c.accentText],
    success: [c.successSoft, c.success],
    warning: [c.warningSoft, c.warning],
    danger: [c.dangerSoft, c.danger],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <RNText style={{ color: fg, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 }}>{label}</RNText>
    </View>
  );
}

export function Empty({ icon, title, body, action }: { icon: string; title: string; body?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: c.elevated, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={26} color={c.faint} />
      </View>
      <Text weight="semibold" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {body ? (
        <Text size="sm" tone="muted" style={{ textAlign: 'center' }}>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

/** A row of choices, one picked. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: on ? c.ink : c.surface, borderWidth: on ? 0 : StyleSheet.hairlineWidth, borderColor: c.lineStrong }}
          >
            <RNText style={{ color: on ? c.canvas : c.muted, fontFamily: fonts.medium, fontSize: 13 }}>{o.label}</RNText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

export function Notice({ tone = 'neutral', children }: { tone?: 'neutral' | 'danger' | 'success' | 'warning'; children: ReactNode }) {
  const c = useColors();
  const bg = tone === 'danger' ? c.dangerSoft : tone === 'success' ? c.successSoft : tone === 'warning' ? c.warningSoft : c.elevated;
  const fg = tone === 'danger' ? 'danger' : tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'muted';
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.md, padding: 12 }}>
      <Text size="sm" tone={fg}>
        {children}
      </Text>
    </View>
  );
}
