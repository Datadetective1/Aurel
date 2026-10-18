import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { ownership } from '@/lib/workspace'
import { logger } from '@/lib/logger'

/** Find or create the organisation by name, scoped to the workspace. */
export async function resolveOrganization(name: string | undefined): Promise<string | null> {
  const trimmed = name?.trim()
  if (!trimmed) return null

  const supabase = await createClient()
  const own = await ownership()

  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('workspace_id', own.workspace_id)
    .ilike('name', trimmed)
    .limit(1)
    .maybeSingle()

  if (existing) return existing.id

  const { data: created, error } = await supabase
    .from('organizations')
    .insert({ ...own, name: trimmed })
    .select('id')
    .single()

  if (error) {
    logger.warn('organization.create_failed', { code: error.code })
    return null
  }
  return created.id
}
