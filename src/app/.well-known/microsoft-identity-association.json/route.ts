import { NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'

/**
 * Microsoft publisher-domain verification.
 *
 * Entra verifies an app registration's publisher domain by fetching this file
 * from that domain and checking it lists the application's client ID. Without
 * a verified publisher domain the consent screen shows the app as coming from
 * an unverified, unrecognised publisher.
 *
 * Served from the configured client ID rather than a committed literal, so it
 * is always the app this deployment actually authenticates as. The client ID
 * is not a secret -- it is in every authorization URL the app sends. Absent
 * configuration, there is nothing true to say, so it is a 404.
 *
 * This is only the domain half. The verified-publisher badge itself needs a
 * Microsoft partner account and is done in Entra -- see
 * docs/MICROSOFT_PUBLISHER_VERIFICATION.md.
 */
export const dynamic = 'force-dynamic'

export function GET() {
  const applicationId = serverEnv.MICROSOFT_CLIENT_ID
  if (!applicationId) return new NextResponse(null, { status: 404 })

  return NextResponse.json(
    { associatedApplications: [{ applicationId }] },
    { headers: { 'cache-control': 'public, max-age=3600' } },
  )
}
