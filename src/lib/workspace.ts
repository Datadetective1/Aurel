import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'

/**
 * Workspace resolution.
 *
 * Every domain row is written into a workspace. Today each user has exactly one
 * personal workspace provisioned at signup, so this is a lookup — but routing
 * writes through it now means team workspaces later are a change to this
 * function rather than to every insert in the codebase.
 */

export interface WorkspaceContext {
  workspaceId: string
  userId: string
  /** 'private' keeps a row visible only to its author, even inside a shared workspace. */
  defaultVisibility: 'private' | 'shared'
}

export const getWorkspace = cache(async (): Promise<WorkspaceContext> => {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_workspace_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.default_workspace_id) {
    return {
      workspaceId: profile.default_workspace_id,
      userId: user.id,
      // Personal relationship notes default to private. Sharing is always an
      // explicit act, never a side effect of joining a workspace.
      defaultVisibility: 'private',
    }
  }

  // Fallback for an account created before workspaces existed, or if the signup
  // trigger did not fire. Membership is the source of truth.
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership?.workspace_id) {
    throw new Error('[aurel] no workspace for user; signup provisioning did not complete')
  }

  await supabase
    .from('profiles')
    .update({ default_workspace_id: membership.workspace_id })
    .eq('id', user.id)

  return { workspaceId: membership.workspace_id, userId: user.id, defaultVisibility: 'private' }
})

/** Ownership columns to spread into any domain insert. */
export async function ownership() {
  const { workspaceId, userId, defaultVisibility } = await getWorkspace()
  return { workspace_id: workspaceId, user_id: userId, visibility: defaultVisibility } as const
}

/** Ownership columns for tables that have no `visibility` column. */
export async function ownershipNoVisibility() {
  const { workspaceId, userId } = await getWorkspace()
  return { workspace_id: workspaceId, user_id: userId } as const
}
