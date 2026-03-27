import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml
     * - API webhooks (external callers, no session needed)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/webhooks).*)',
  ],
};
