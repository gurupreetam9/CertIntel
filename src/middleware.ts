import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  // Firebase Authentication primarily works on the client-side.
  // Client-side checks in `ProtectedPage` will handle auth redirects.
  // This middleware can be expanded for security headers, rate limiting, etc.
  return NextResponse.next();
}

// Only run middleware on paths that actually need it.
// An empty matcher means middleware won't run on any path,
// eliminating per-request overhead for the no-op case.
export const config = {
  matcher: [],
};
