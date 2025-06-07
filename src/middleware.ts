import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // This is a placeholder middleware.
  // Firebase Authentication primarily works on the client-side.
  // Protecting server-rendered pages or API routes usually involves:
  // 1. Client sends Firebase ID token (e.g., in a cookie or Authorization header).
  // 2. Middleware (or API route handler) verifies this token using Firebase Admin SDK.
  //
  // For client-side route protection, we are using the `ProtectedPage` component
  // which checks auth state via `useAuth()` hook from `AuthContext`.
  //
  // This middleware can be expanded for tasks like:
  // - Setting security headers
  // - Rate limiting
  // - Redirects based on geo-location, etc.
  // - Advanced Firebase token verification if you implement a cookie-based session.

  // Example: Log all requests
  // console.log(`Middleware: Path accessed - ${pathname}`);

  // Allow all requests to proceed for now.
  // Client-side checks in `ProtectedPage` will handle auth redirects.
  return NextResponse.next();
}

// Configure which paths the middleware runs on.
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - login
     * - register
     */
    // '/((?!api|_next/static|_next/image|favicon.ico|login|register).*)', // Example matcher
  ],
};
