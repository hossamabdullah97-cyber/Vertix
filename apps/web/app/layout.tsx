import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { LanguageProvider } from '@/components/i18n/LanguageProvider';
import { LOCALE_COOKIE, dirOf, resolveLocale } from '@/lib/i18n/config';

export const metadata: Metadata = {
  title: 'Vertex Connect',
  description: 'NFC-powered digital business cards',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve the initial locale from the cookie so SSR markup (lang/dir) matches
  // the client and there's no flash of the wrong language/direction.
  const locale = resolveLocale(cookies().get(LOCALE_COOKIE)?.value);

  return (
    // lang/dir are locale-driven and may be reconciled client-side (stored
    // preference); suppress the benign root-attribute hydration warning.
    <html lang={locale} dir={dirOf(locale)} suppressHydrationWarning>
      <head>
        {/* The text font every page needs first, fetched with the page. */}
        <link rel="preload" href="/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossOrigin="" />
        {locale === 'ar' && <link rel="preload" href="/fonts/plex-arabic-arabic-400.woff2" as="font" type="font/woff2" crossOrigin="" />}
      </head>
      <body suppressHydrationWarning>
        <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
