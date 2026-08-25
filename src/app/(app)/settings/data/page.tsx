import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireOnboardedUser } from '@/lib/auth'
import { getWorkspace } from '@/lib/workspace'
import { seedDemoData } from '@/lib/demo/seed'
import { track } from '@/lib/analytics'

/**
 * Loading demo data is a GET with a side effect, which is normally wrong — but
 * it is reached only from an authenticated in-app link, it is idempotent (a
 * second visit is a no-op), and it is trivially reversible from Settings. That
 * makes it a reasonable trade for a one-click "show me what this looks like".
 */
export default async function LoadDemoDataPage() {
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()
  const { workspaceId } = await getWorkspace()

  const result = await seedDemoData(supabase, user.id, workspaceId)
  if (result.peopleCreated > 0) {
    await track('demo_data_seeded', { people: result.peopleCreated })
  }

  redirect(result.ok ? '/today?demo=1' : '/today')
}
