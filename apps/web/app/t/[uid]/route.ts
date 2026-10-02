import { NextResponse, type NextRequest } from 'next/server';
import { API_URL } from '@/lib/api';
import { VISITOR_COOKIE } from '@/lib/tap';

export const dynamic = 'force-dynamic';

const YEAR = 60 * 60 * 24 * 365;

/**
 * What a chip opens: /t/<serial> on this app's own (or a short tap) domain.
 * It hands the tap to the API gateway with the visitor's id from a cookie, so
 * a phone that taps twice, or taps and then opens the card, is one visitor
 * and its second tap within moments is not counted again. The browser goes to
 * the API itself, so the gateway sees the phone's own address and browser.
 */
export function GET(req: NextRequest, { params }: { params: { uid: string } }) {
  let visitor = req.cookies.get(VISITOR_COOKIE)?.value;
  if (!visitor || !/^[\w-]{8,64}$/.test(visitor)) visitor = crypto.randomUUID();

  // An API_URL given as a path (/api behind the same host) resolves against this request.
  const target = new URL(`${API_URL}/t/${encodeURIComponent(params.uid)}`, req.url);
  target.searchParams.set('v', visitor);

  const res = NextResponse.redirect(target, 302);
  res.headers.set('Cache-Control', 'no-store');
  res.cookies.set(VISITOR_COOKIE, visitor, { maxAge: YEAR, path: '/', sameSite: 'lax', secure: req.nextUrl.protocol === 'https:' });
  return res;
}
