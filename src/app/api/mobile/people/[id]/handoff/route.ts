import { z } from 'zod'
import { mobileContext, json } from '@/lib/mobile/route'
import { getPeopleContext } from '@/lib/ai/context'
import { relationshipLabel } from '@/lib/conversations/room'
import { composeHandoff } from '@/lib/people/handoff'
import { brand } from '@/lib/brand'
import type { HandoffResponse } from '@/lib/mobile/contracts'

/**
 * One relationship as a plain-text brief for a colleague, or for the user
 * after time away. Nothing is generated: it is what the record holds, with
 * its evidence labels. The user's private notes go in only with `?notes=1`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const person = (await getPeopleContext(ctx.supabase, ctx.user.id, [id])).get(id)
  if (!person) return json({ error: 'not_found' }, 404)

  const includeNotes = new URL(request.url).searchParams.get('notes') === '1'
  const pack: HandoffResponse = composeHandoff(person, {
    timeZone: ctx.timeZone,
    includeNotes,
    productName: brand.name,
    relationship: relationshipLabel(person.relationshipType),
  })
  return json(pack)
}
