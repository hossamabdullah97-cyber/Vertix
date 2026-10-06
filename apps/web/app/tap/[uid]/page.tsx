import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, resolveLocale } from '@/lib/i18n/config';
import { resources } from '@/lib/i18n/resources';
import { Icon } from '@/components/Icon';
import { VMark } from '@/components/brand/VMark';

export const metadata: Metadata = { robots: { index: false } };

type State = 'unassigned' | 'disabled' | 'unknown';
interface Strings {
  home: string;
  link: string;
  unassigned: { title: string; body: string };
  disabled: { title: string; body: string };
  unknown: { title: string; body: string };
}

/**
 * Where the NFC gateway sends a tap that has no card to open: a chip not
 * linked yet (with the way to link it, for whoever holds it), one its owner
 * turned off, or one that is not ours. A visitor used to get raw JSON, or
 * the home page with no word of why.
 *
 * Server-rendered and plain, like the 404, so it costs a phone almost nothing.
 */
export default async function TapPage(
  props: { params: Promise<{ uid: string }>; searchParams: Promise<{ s?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const t = (resources[locale].common as unknown as { tap: Strings }).tap;
  const state: State = searchParams.s === 'unassigned' || searchParams.s === 'disabled' ? searchParams.s : 'unknown';
  const uid = decodeURIComponent(params.uid);
  const copy = t[state];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10 text-ink">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
        <span
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${
            state === 'unassigned' ? 'bg-accent-soft text-accent' : 'bg-elevated text-muted'
          }`}
        >
          <Icon name={state === 'unassigned' ? 'tag' : 'alert'} size={22} />
        </span>
        <h1 className="mt-4 text-xl font-semibold leading-snug">{copy.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{copy.body}</p>
        <p dir="ltr" className="mt-3 font-mono text-2xs text-faint">
          {uid}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {state === 'unassigned' && (
            <a href={`/tags?q=${encodeURIComponent(uid)}`} className="v-btn !h-11 w-full text-sm font-semibold">
              {t.link}
            </a>
          )}
          <a
            href="/"
            className={
              state === 'unassigned'
                ? 'inline-flex min-h-11 items-center justify-center text-sm font-medium text-muted hover:text-ink'
                : 'v-btn !h-11 w-full text-sm font-semibold'
            }
          >
            {t.home}
          </a>
        </div>
      </div>
      <a href="/" className="mt-6 flex min-h-11 items-center gap-2 text-xs font-medium text-faint">
        <span className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-accent text-white">
          <VMark size={10} strokeWidth={3} />
        </span>
        Vertex Connect
      </a>
    </main>
  );
}
