import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('vertex_token')?.value;
  const { pathname } = request.nextUrl;

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
  ],
};
