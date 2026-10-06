import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { messagesScript, messagesVersion } from '@/lib/i18n/bundle';
import { LOCALES, type Locale } from '@/lib/i18n/config';

/** Compressed once per language (Next does not compress a route's own response). */
const encoded = new Map<string, Uint8Array>();
function body(locale: Locale, encoding: 'br' | 'gzip' | null): Uint8Array | string {
  if (!encoding) return messagesScript(locale);
  const key = `${locale}:${messagesVersion(locale)}:${encoding}`;
  let b = encoded.get(key);
  if (!b) {
    const raw = Buffer.from(messagesScript(locale));
    b = new Uint8Array(encoding === 'br' ? brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }) : gzipSync(raw, { level: 9 }));
    encoded.set(key, b);
  }
  return b;
}

/** A language's strings for the browser (see lib/i18n/bundle.ts). */
export async function GET(request: Request, props: { params: Promise<{ locale: string }> }) {
  const params = await props.params;
  if (!(LOCALES as readonly string[]).includes(params.locale)) return new Response('Not found', { status: 404 });
  const locale = params.locale as Locale;
  const accepts = request.headers.get('accept-encoding') ?? '';
  const encoding = /\bbr\b/.test(accepts) ? 'br' : /\bgzip\b/.test(accepts) ? 'gzip' : null;
  // Versioned by content: the current version is cached for good, anything else briefly.
  const current = new URL(request.url).searchParams.get('v') === messagesVersion(locale);
  return new Response(body(locale, encoding) as BodyInit, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': current ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      Vary: 'Accept-Encoding',
      ...(encoding ? { 'Content-Encoding': encoding } : {}),
    },
  });
}
