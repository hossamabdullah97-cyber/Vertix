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
    pathname.startsWith('/billing');

  const isAuthRoute =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password';

  if (isProtectedRoute && !token) {
    const loginUrl = new URL('/login', request.url);
    // Redirect unauthenticated requests to login page
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && token) {
    const dashboardUrl = new URL('/dashboard', request.url);
    // Redirect authenticated requests away from login pages
    return NextResponse.redirect(dashboardUrl);
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
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
  ],
};
