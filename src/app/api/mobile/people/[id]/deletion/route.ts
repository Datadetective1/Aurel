import { z } from 'zod'
import { mobileContext, json } from '@/lib/mobile/route'
import { previewPersonDeletion } from '@/lib/people/lifecycle.server'
import { describeDeletion } from '@/lib/people/lifecycle'
import type { DeletionPreviewResponse } from '@/lib/mobile/contracts'

/**
 * What deleting this person would do, counted from the record: what goes,
 * what stays unlinked, and the loops that stay (flagged when their words
 * still name them). The same preview as the web's confirmation page.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const preview = await previewPersonDeletion(ctx.supabase, ctx.user.id, id)
  if (!preview) return json({ error: 'not_found' }, 404)
  const words = describeDeletion(preview)

  const body: DeletionPreviewResponse = {
    person: preview.person,
    deleted: [
      `${preview.person.name}'s record: name, role, contact details and notes`,
      ...words.deleted,
    ],
    unlinked: words.unlinked,
    retainedLoops: preview.retainedLoops,
  }
  return json(body)
}
