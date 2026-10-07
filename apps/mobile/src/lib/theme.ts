import { useColorScheme } from 'react-native';

/** The web app's tokens (apps/web/app/globals.css), as colours React Native takes. */
const light = {
  canvas: '#F2F1ED',
  surface: '#FFFFFF',
  elevated: '#F8F7F5',
  ink: '#18181B',
  muted: '#56555B',
  faint: '#6E6D73',
  line: '#E9E7E2',
  lineStrong: '#DCD9D2',
  accent: '#2563EB',
  accentText: '#2563EB',
  accentSoft: 'rgba(37, 99, 235, 0.08)',
  onAccent: '#FFFFFF',
  success: '#059669',
  successSoft: 'rgba(16, 185, 129, 0.1)',
  warning: '#B45309',
  warningSoft: 'rgba(245, 158, 11, 0.12)',
  danger: '#DC2626',
  dangerSoft: 'rgba(239, 68, 68, 0.08)',
};

const dark: typeof light = {
  canvas: '#0E0E11',
  surface: '#161619',
  elevated: '#1B1B1E',
  ink: '#EDEDEF',
  muted: '#A1A1A8',
  faint: '#85858D',
  line: '#27272B',
  lineStrong: '#323238',
  accent: '#2563EB',
  accentText: '#6C9BF7',
  accentSoft: 'rgba(53, 114, 240, 0.18)',
  onAccent: '#FFFFFF',
  success: '#34D399',
  successSoft: 'rgba(16, 185, 129, 0.16)',
  warning: '#FBBF24',
  warningSoft: 'rgba(245, 158, 11, 0.16)',
  danger: '#F87171',
  dangerSoft: 'rgba(239, 68, 68, 0.14)',
};

export type Colors = typeof light;
export const palettes = { light, dark };

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/** One family for both scripts: IBM Plex Sans Arabic carries Latin too, as on the web. */
export const fonts = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semibold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
};

export const radius = { sm: 6, md: 8, lg: 12, xl: 14, pill: 999 };
export const space = (n: number) => n * 4;
