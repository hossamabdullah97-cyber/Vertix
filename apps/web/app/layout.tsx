import { THEME_SCRIPT } from '@/lib/themeScript';
import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import './globals.css';
import { LanguageProvider } from '@/components/i18n/LanguageProvider';
import { WorkspaceScope } from '@/components/WorkspaceScope';
import { LOCALE_COOKIE, dirOf, resolveLocale } from '@/lib/i18n/config';
import Script from 'next/script';
import { resources } from '@/lib/i18n/resources';
import { messagesUrl } from '@/lib/i18n/bundle';
import { CARD_SURFACE_HEADER } from '@/lib/surface';

export const metadata: Metadata = {
  title: 'Vertex Connect',
  description: 'NFC-powered digital business cards',
};

// viewport-fit=cover lets the phone's bottom bar sit clear of the home indicator (env(safe-area-inset-bottom)).
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve the initial locale from the cookie so SSR markup (lang/dir) matches
  // the client and there's no flash of the wrong language/direction.
  const locale = resolveLocale(cookies().get(LOCALE_COOKIE)?.value);
  // A public card carries its own few strings (lib/profileI18n), so it skips
  // the app's translations and i18next: a visitor's phone downloads neither.
  const publicCard = headers().get(CARD_SURFACE_HEADER) === '1';
  // The server renders with every language at hand; the browser gets its one
  // from /i18n/<locale> (see lib/i18n/bundle.ts).
  globalThis.__VX_MESSAGES ??= resources;
  const urls = { en: messagesUrl('en'), ar: messagesUrl('ar') };

  return (
    // lang/dir are locale-driven and may be reconciled client-side (stored
    // preference); suppress the benign root-attribute hydration warning.
    <html lang={locale} dir={dirOf(locale)} suppressHydrationWarning>
      <head>
        {/* The saved light/dark theme, applied before the first paint so a dark page never flashes white. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* The text font every page needs first, fetched with the page. */}
        <link rel="preload" href="/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossOrigin="" />
        {locale === 'ar' && <link rel="preload" href="/fonts/plex-arabic-arabic-400.woff2" as="font" type="font/woff2" crossOrigin="" />}
        {/* The installable app (public/manifest.webmanifest, sw.js). Not on a
            public card: a visitor adding a card to their home screen should
            get the card, not the Vertex app. */}
        {!publicCard && (
          <>
            <link rel="manifest" href="/manifest.webmanifest" />
            {/* The installed app's status bar takes the colour of its sheets. */}
            <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
            <meta name="theme-color" content="#161618" media="(prefers-color-scheme: dark)" />
            <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-title" content="Vertex" />
            <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          </>
        )}
      </head>
      <body suppressHydrationWarning>
        {publicCard ? (
          children
        ) : (
          <>
            {/* The page's language only, cached, and in place before hydration; the other is fetched on a switch. */}
            <Script src={urls[locale]} strategy="beforeInteractive" />
            <LanguageProvider initialLocale={locale} urls={urls}>
              <WorkspaceScope>{children}</WorkspaceScope>
            </LanguageProvider>
          </>
        )}
      </body>
    </html>
  );
}
