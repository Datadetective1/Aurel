import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeRedirectPath } from '@/lib/auth'
import { logger } from '@/lib/logger'

/**
 * OAuth / email-link callback.
 *
 * Exchanges the one-time code for a session, then redirects. The `next` target
 * is passed through safeRedirectPath, because it arrives from a URL a user
 * could have been sent by anyone — without that, this endpoint would be an open
 * redirect with a freshly-minted session attached.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = safeRedirectPath(searchParams.get('next'), '/today')
  const errorDescription = searchParams.get('error_description')

  if (errorDescription) {
    logger.warn('auth.callback_provider_error', { hasDescription: true })
    return NextResponse.redirect(`${origin}/sign-in?error=link_invalid`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=link_invalid`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    logger.warn('auth.callback_exchange_failed', { code: error.code, status: error.status })
    return NextResponse.redirect(`${origin}/sign-in?error=link_expired`)
  }

  // Send brand-new accounts through onboarding rather than into an empty app.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.onboarding_completed_at && next === '/today') {
      return NextResponse.redirect(`${origin}/onboarding`)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
