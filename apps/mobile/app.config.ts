import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json, plus what depends on where the app is built for (EAS sets these
 * per build profile, eas.json):
 * - EXPO_PUBLIC_WEB_URL: the website whose links open the app (iOS Universal
 *   Links, Android App Links), checked against its /.well-known/ files.
 * - EAS_PROJECT_ID: the Expo project, which push notifications are sent for.
 * - GOOGLE_SERVICES_JSON: the Firebase project's google-services.json (an EAS
 *   file variable), which Android needs to receive them.
 */

// The signed-in pages the app opens itself; the website lists the same
// (apps/web/lib/vertexAppLinks.ts). Never /c/ or /t/: those are for visitors.
const APP_PATHS = ['/dashboard', '/leads', '/notifications', '/invitations', '/cards'];

export default ({ config }: ConfigContext): ExpoConfig => {
  const web = process.env.EXPO_PUBLIC_WEB_URL ?? '';
  const host = /^https:\/\//.test(web) ? new URL(web).host : null;
  const projectId = process.env.EAS_PROJECT_ID;
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;

  return {
    ...(config as ExpoConfig),
    ios: {
      ...config.ios,
      ...(host ? { associatedDomains: [`applinks:${host}`, `webcredentials:${host}`] } : {}),
    },
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      ...(host
        ? {
            intentFilters: [
              {
                action: 'VIEW',
                autoVerify: true,
                data: APP_PATHS.map((pathPrefix) => ({ scheme: 'https', host, pathPrefix })),
                category: ['BROWSABLE', 'DEFAULT'],
              },
            ],
          }
        : {}),
    },
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { projectId } } : {}),
    },
  };
};
