import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { currentLang } from './i18n';
import { secrets } from './storage';

/**
 * Notifications on this phone's lock screen: the same ones as in the app,
 * sent by the server through Expo's push service (apps/api push.service.ts).
 */

const TOKEN = 'vertex_push_token';
const ASKED = 'vertex_push_asked';

export type PushState = 'on' | 'off' | 'denied' | 'unavailable';

// Shown even while the app is open: a new lead is worth the interruption.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const projectId = () => (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;

/** Whether this phone can have them at all: a real phone, in a build made for an Expo project. */
export const pushAvailable = () => Device.isDevice && !!projectId();

export async function pushState(): Promise<PushState> {
  if (!pushAvailable()) return 'unavailable';
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'denied') return 'denied';
  return status === 'granted' && (await secrets.get(TOKEN)) ? 'on' : 'off';
}

/**
 * Registers this phone with the server, in the app's language. Asks the
 * person only when `ask` is set (from a button, or once after the first
 * sign-in); otherwise it only refreshes a permission already given.
 */
export async function enablePush(ask: boolean): Promise<PushState> {
  if (!pushAvailable()) return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: currentLang() === 'ar' ? 'العملاء والتنبيهات' : 'Leads and alerts',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#2563EB',
    });
  }
  let { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask && canAskAgain) {
    await secrets.set(ASKED, '1');
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return status === 'denied' ? 'denied' : 'off';
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId()! });
  await api('/notifications/push/app', { method: 'POST', json: { token, platform: Platform.OS, lang: currentLang() } });
  await secrets.set(TOKEN, token);
  return 'on';
}

/** After signing in: on if allowed before, and asked once on this phone. */
export async function enablePushAfterSignIn() {
  return enablePush(!(await secrets.get(ASKED))).catch(() => 'off' as PushState);
}

/** Signing out: this phone stops receiving the account's notifications. */
export async function disablePush() {
  const token = await secrets.get(TOKEN);
  if (!token) return;
  await api('/notifications/push/app', { method: 'DELETE', json: { token } }).catch(() => undefined);
  await secrets.set(TOKEN, null);
}

/** The website address a tapped notification is about. */
export function notificationUrl(response: Notifications.NotificationResponse | null | undefined): string | null {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' ? url : null;
}

export const useLastNotificationResponse = Notifications.useLastNotificationResponse;
