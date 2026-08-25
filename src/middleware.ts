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

const PUBLIC_PREFIXES = [
  '/',
  '/pricing',
  '/privacy',
  '/terms',
  '/security',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/auth',
  '/check-email',
]

function isPublic(pathname: string): boolean {
  if (pathname === '/') return true
  return PUBLIC_PREFIXES.some((p) => p !== '/' && (pathname === p || pathname.startsWith(`${p}/`)))
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

  if (!user && !isPublic(pathname)) {
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
