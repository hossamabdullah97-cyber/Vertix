/**
 * The website addresses the phone app opens itself (iOS Universal Links,
 * Android App Links), and the files on /.well-known/ that let Apple and
 * Google check the app may. Only a signed-in person's pages: a card or a
 * chip's address (/c/…, /t/…) is for the people it is shared with, and must
 * open in their browser. apps/mobile/app.config.ts lists the same paths for
 * Android, and src/lib/links.ts maps them to the app's screens.
 */
export const APP_PATHS = ['/dashboard', '/leads', '/notifications', '/invitations', '/cards'] as const;

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** apple-app-site-association, or null until the app's ids are set (APPLE_APP_IDS: "<Team ID>.<bundle id>"). */
export function appleAppSiteAssociation(env: Record<string, string | undefined> = process.env) {
  const appIDs = list(env.APPLE_APP_IDS);
  if (!appIDs.length) return null;
  return {
    applinks: {
      details: [{ appIDs, components: APP_PATHS.flatMap((p) => [{ '/': p }, { '/': `${p}/*` }]) }],
    },
    // The passwords saved for the website are offered in the app's sign-in.
    webcredentials: { apps: appIDs },
  };
}

/** assetlinks.json, or null until the signing certificate's fingerprint is set (ANDROID_CERT_FINGERPRINTS). */
export function assetLinks(env: Record<string, string | undefined> = process.env) {
  const fingerprints = list(env.ANDROID_CERT_FINGERPRINTS).map((f) => f.toUpperCase());
  if (!fingerprints.length) return null;
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
      target: { namespace: 'android_app', package_name: env.ANDROID_PACKAGE?.trim() || 'dev.vertex.connect', sha256_cert_fingerprints: fingerprints },
    },
  ];
}
