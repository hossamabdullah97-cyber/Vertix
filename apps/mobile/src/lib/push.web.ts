/** The browser build has no lock-screen notifications (the website has its own). */
export type PushState = 'on' | 'off' | 'denied' | 'unavailable';
export const pushAvailable = () => false;
export const pushState = async (): Promise<PushState> => 'unavailable';
export const enablePush = async (_ask: boolean): Promise<PushState> => 'unavailable';
export const enablePushAfterSignIn = async (): Promise<PushState> => 'unavailable';
export const disablePush = async () => undefined;
export const notificationUrl = (_r: unknown): string | null => null;
export const useLastNotificationResponse = (): null => null;
