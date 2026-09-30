import { cookies } from 'next/headers';
import { VMark } from '@/components/brand/VMark';
import { LOCALE_COOKIE, dirOf, resolveLocale } from '@/lib/i18n/config';
import { resources } from '@/lib/i18n/resources';

/**
 * A card link that resolves to nothing. The reader is a visitor without an
 * account, so it explains the likely cause rather than pointing into the app.
 * Rendered on the server, like the rest of a public card, so it ships no
 * translation code.
 */
export default function CardNotFound() {
  const locale = resolveLocale(cookies().get(LOCALE_COOKIE)?.value);
  const strings = (resources[locale].cards as { notFound: Record<'title' | 'body' | 'hint', string> }).notFound;
  const t = (key: string) => strings[key.replace('notFound.', '') as 'title' | 'body' | 'hint'];

  return (
    <main dir={dirOf(locale)} className="flex min-h-[100dvh] items-center justify-center bg-[#f5f4f1] px-6 text-[#17171a]">
      <div className="w-full max-w-[360px] rounded-[20px] bg-white p-7 text-center shadow-[0_0_0_1px_#ecebe7,0_24px_48px_-24px_rgba(0,0,0,0.2)]">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f5f4f1] text-[#5e5d63]">
          <VMark size={20} strokeWidth={3} />
        </span>
        <h1 className="mt-4 text-2xl font-semibold">{t('notFound.title')}</h1>
        <p className="mt-1.5 text-base leading-relaxed text-[#5e5d63]">{t('notFound.body')}</p>
        <p className="mt-3 text-sm leading-relaxed text-[#6f6e75]">{t('notFound.hint')}</p>
      </div>
    </main>
  );
}
