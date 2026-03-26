import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login'];

const ROLE_REDIRECTS: Record<string, { required: string; fallback: string }> = {
  '/executive': { required: 'view_executive_dashboard', fallback: '/analyst' },
  '/analyst': { required: 'view_analyst_dashboard', fallback: '/executive' },
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Skip static / api / _next paths
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check for access token in cookie (client-readable)
  const token = request.cookies.get('accessToken')?.value;

  // Also check localStorage via a custom header isn't possible in middleware,
  // so we rely on a cookie-based approach or redirect for safety.
  // Since tokens are in localStorage, do a soft check:
  // If no cookie, check if there's an authorization header
  if (!token) {
    // Try to read from a custom cookie that the client may set
    const userCookie = request.cookies.get('soar_user')?.value;

    if (!userCookie) {
      // No auth detected — redirect to login
      // But allow the client-side hydration to handle localStorage-based auth
      // Only redirect if accessing protected routes
      const protectedPaths = ['/executive', '/analyst', '/virustotal', '/systems', '/reports', '/settings', '/audit'];
      const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

      if (isProtected) {
        // Let the page render — client-side will check localStorage and redirect if needed
        // This avoids blocking users who have tokens in localStorage but not cookies
        return NextResponse.next();
      }
    }

    // If we have user cookie, parse permissions for role-based routing
    if (userCookie) {
      try {
        const user = JSON.parse(userCookie);
        const permissions = user.permissions || {};

        // Check role-based redirects
        const routeConfig = ROLE_REDIRECTS[pathname];
        if (routeConfig && !permissions[routeConfig.required]) {
          return NextResponse.redirect(new URL(routeConfig.fallback, request.url));
        }
      } catch {
        // Invalid cookie — clear and redirect
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('soar_user');
        return response;
      }
    }
  }

  // Redirect root to appropriate dashboard
  if (pathname === '/') {
    const userCookie = request.cookies.get('soar_user')?.value;
    if (userCookie) {
      try {
        const user = JSON.parse(userCookie);
        if (user.role === 'c_level') {
          return NextResponse.redirect(new URL('/executive', request.url));
        }
        return NextResponse.redirect(new URL('/analyst', request.url));
      } catch {
        return NextResponse.redirect(new URL('/login', request.url));
      }
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
