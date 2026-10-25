import { getOptionalUser } from '@/lib/auth'
import { json } from '@/lib/mobile/route'
import { bearerToken } from '@/lib/supabase/server'
import { exportMyData } from '@/app/(app)/settings/actions'
import type { ExportResponse } from '@/lib/mobile/contracts'

/**
 * Everything stored for the account, as the web's Privacy & data export. Like
 * deletion, not behind the onboarding gate: a person can always take their
 * data. The app saves it to a file and offers the share sheet.
 */
export async function GET() {
  if (!(await bearerToken())) return json({ error: 'unauthenticated' }, 401)
  const user = await getOptionalUser()
  if (!user) return json({ error: 'unauthenticated' }, 401)

  const result = await exportMyData()
  return json<ExportResponse>(result, result.ok ? 200 : 502)
}
