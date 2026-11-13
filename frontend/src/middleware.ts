import { NextResponse, type NextRequest } from 'next/server';

/**
 * The /ui-kit developer page is only for `npm run dev`. In production it is sent to
 * an unknown path so it gets the normal "Page not found" page with a real 404 status
 * (the page's own notFound() would stream as 200 behind the loading screen).
 */
export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.rewrite(new URL('/__not-found', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/ui-kit', '/ui-kit/:path*'] };
