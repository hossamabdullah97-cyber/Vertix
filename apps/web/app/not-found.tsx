import { cookies } from 'next/headers';
import { LOCALE_COOKIE, resolveLocale } from '@/lib/i18n/config';
import { resources } from '@/lib/i18n/resources';

/**
 * The app-wide 404. It used to claim "Card not found" for every bad URL, which
 * was wrong outside /c/[slug] — cards now have their own not-found page.
 * Rendered on the server: Next attaches this page to every route, so a client
 * component here would put the translation code on public cards too. A plain
 * <a>, not next/link, for the same reason: a server component's Link is
 * registered with another page's chunks, which every card then downloads.
 */
export default function NotFound() {
  const locale = resolveLocale(cookies().get(LOCALE_COOKIE)?.value);
  const t = (resources[locale].common as { notFound: Record<'title' | 'body' | 'home', string> }).notFound;

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold">{t.title}</h1>
        <p className="mt-2 text-muted">{t.body}</p>
        <a href="/dashboard" className="v-btn mt-6 !h-11 px-6 text-sm font-bold sm:!h-10">
          {t.home}
        </a>
      </div>
    </main>
  );
}
