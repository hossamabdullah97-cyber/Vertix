import { useEffect, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import { router, Stack, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFonts, IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold } from '@expo-google-fonts/ibm-plex-sans-arabic';
import { api } from '@/lib/api';
import { startI18n } from '@/lib/i18n';
import { appRoute } from '@/lib/links';
import { notificationUrl, useLastNotificationResponse } from '@/lib/push';
import { SessionProvider, useSession } from '@/lib/session';
import { fonts, palettes } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [loaded] = useFonts({ IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold });
  const [i18nReady, setI18nReady] = useState(false);
  useEffect(() => {
    void startI18n().then(() => setI18nReady(true));
  }, []);
  if (!loaded || !i18nReady) return null;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Navigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

/** Signed in, the app; signed out, the sign-in screen. Nothing else is reachable without a session. */
function Navigator() {
  const { status } = useSession();
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? palettes.dark : palettes.light;

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync().catch(() => undefined);
  }, [status]);

  // A tapped notification (the app open, in the background, or started by the tap) opens what it is about.
  const response = useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (status !== 'signedIn' || !response) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const notificationId = response.notification.request.content.data?.notificationId;
    if (typeof notificationId === 'string') void api(`/notifications/${notificationId}/read`, { method: 'PATCH' }).catch(() => undefined);
    const url = notificationUrl(response);
    const route = url ? appRoute(url) : null;
    router.push((route ?? '/notifications') as Href);
  }, [status, response]);

  if (status === 'loading') return null;

  const signedIn = status === 'signedIn';
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.surface },
          headerTintColor: c.ink,
          headerTitleStyle: { fontFamily: fonts.semibold },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.canvas },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="lead/[id]" options={{ title: t('lead.title') }} />
          <Stack.Screen name="card/[id]" options={{ title: t('card.title') }} />
          <Stack.Screen name="notifications" options={{ title: t('notifications.title') }} />
          <Stack.Screen name="workspaces" options={{ title: t('workspaces.title'), presentation: 'modal' }} />
          <Stack.Screen name="web" options={{ title: '' }} />
          <Stack.Screen name="chip" options={{ title: t('chip.title') }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
