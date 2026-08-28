import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Session refresh + route protection.
 *
 * Runs on every matched request. Two jobs:
 *   1. Refresh the Supabase auth cookie so server components see a live session.
 *   2. Gate private routes before any page code runs.
 *
 * IMPORTANT: this uses getUser(), not getSession(). getSession() reads the JWT
 * from the cookie without verifying it against the auth server, so it can be
 * spoofed. getUser() revalidates. Never relax that here.
 *
 * Middleware is a convenience gate, not the security boundary — row level
 * security is. Every page and action re-checks auth independently.
 */

/**
 * The signed-in surface, named explicitly.
 *
 * This used to be the inverse — an allowlist of public paths, with everything
 * unrecognised redirected to /sign-in. That gated the app correctly but made
 * every mistyped or stale URL answer 307 -> /sign-in -> 200, so a crawler
 * asking for a page that does not exist was told one does. Google reads that
 * as a soft 404: the real 404 was unreachable, and non-existent URLs competed
 * for crawl budget against real ones.
 *
 * Listing the private roots instead lets unknown paths fall through to
 * not-found.tsx and answer 404 honestly. It does not widen access: every route
 * beneath these prefixes sits under a layout that calls requireUser() /
 * requireOnboardedUser(), and row level security is the actual boundary. A new
 * private route missing from this list is still refused by its own layout —
 * it just costs a render to say so.
 */
const PRIVATE_PREFIXES = [
  '/today',
  '/people',
  '/meetings',
  '/prepare',
  '/coach',
  '/atlas',
  '/settings',
  '/onboarding',
]

function isPrivate(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl

  if (!user && isPrivate(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    // Preserve where they were heading, but only ever as a relative path so this
    // can never be turned into an open redirect.
    url.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  // Signed-in users have no reason to see the auth screens again.
  if (user && (pathname === '/sign-in' || pathname === '/sign-up')) {
    const url = request.nextUrl.clone()
    url.pathname = '/today'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimisation. Keeping the
     * matcher tight matters: this runs an auth round trip on every match.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
}
