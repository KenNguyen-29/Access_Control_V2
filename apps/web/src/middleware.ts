import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/change-password'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // static assets
  ) {
    return NextResponse.next();
  }

  // Cookie set by client after login for middleware visibility (optional companion to localStorage)
  const hasSession =
    Boolean(request.cookies.get('acv2_refresh')?.value) ||
    Boolean(request.cookies.get('acv2_session')?.value);

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic && pathname !== '/') {
    // Soft guard: redirect unauthenticated users hitting app shells.
    // Client layout still enforces accessToken in localStorage.
    if (pathname.startsWith('/home') || pathname.startsWith('/dashboard') || pathname.startsWith('/reports') || pathname.startsWith('/analytics') || pathname.startsWith('/projects') || pathname.startsWith('/shifts') || pathname.startsWith('/users') || pathname.startsWith('/devices') || pathname.startsWith('/access-control') || pathname.startsWith('/settings') || pathname.startsWith('/departments') || pathname.startsWith('/zones') || pathname.startsWith('/evac')) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  if (hasSession && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/home';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo|Background).*)'],
};
