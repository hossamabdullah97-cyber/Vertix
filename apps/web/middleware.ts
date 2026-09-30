import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { CARD_SURFACE_HEADER } from './lib/surface';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('vertex_token')?.value;
  const { pathname } = request.nextUrl;

  // A public card (/c/<slug>, nothing deeper, so any other path still gets the
  // app's not-found page with its translations): tell the root layout, which
  // keeps the app's i18n off it.
  if (/^\/c\/[^/]+\/?$/.test(pathname)) {
    const headers = new Headers(request.headers);
    headers.set(CARD_SURFACE_HEADER, '1');
    return NextResponse.next({ request: { headers } });
  }

  // Define protected and public auth routes
  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/analytics') ||
    pathname.startsWith('/cards') ||
    pathname.startsWith('/leads') ||
    pathname.startsWith('/tags') ||
    pathname.startsWith('/team') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/billing') ||
    pathname.startsWith('/notifications') ||
    pathname.startsWith('/integrations') ||
    pathname.startsWith('/workspace');

  // A reset or invitation link must open even in a browser that is signed in.
  const isAuthRoute = pathname === '/login' || pathname === '/register';

  if (isProtectedRoute && !token) {
    const loginUrl = new URL('/login', request.url);
    // Back to this page once signed in.
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && token) {
    // Already signed in: straight on to where they were going, if it is a
    // page of this app, otherwise home.
    const next = request.nextUrl.searchParams.get('next') ?? '';
    const safe = next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') && !/^\/(login|register)(\/|\?|$)/.test(next);
    return NextResponse.redirect(new URL(safe ? next : '/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/analytics/:path*',
    '/cards/:path*',
    '/leads/:path*',
    '/tags/:path*',
    '/team/:path*',
    '/admin/:path*',
    '/billing/:path*',
    '/notifications/:path*',
    '/integrations/:path*',
    '/workspace/:path*',
    '/login',
    '/register',
    '/c/:path*',
  ],
};
