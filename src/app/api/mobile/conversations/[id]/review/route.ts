import { z } from 'zod'
import { mobileContext, json, readJson } from '@/lib/mobile/route'
import { submitReview } from '@/app/(app)/conversations/actions'
import { LOOP_PRESELECT_THRESHOLD } from '@/lib/conversations/loops'
import { actionDirection } from '@/lib/visual/relationship-actions'
import type { ReviewRequest, ReviewResponse, ReviewResult } from '@/lib/mobile/contracts'

/**
 * WHAT HAPPENED, FOR REVIEW.
 *
 * Everything the reading proposed from one conversation -- promises in each
 * direction, open questions, decisions -- for the user to keep or set aside.
 * Nothing proposed reaches Today, a brief or Ask until it is kept here or on
 * the web; this is the same review gate, through the same action.
 */

async function load(id: string) {
  const ctx = await mobileContext()
  if (!ctx.ok) return { ctx, data: null }
  const { supabase, user } = ctx

  const [{ data: conversation }, { data: loops }, { data: decisions }] = await Promise.all([
    supabase
      .from('interactions')
      .select('id, title, occurred_at, summary, outcome, processing_status, artifact_id')
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('commitments')
      .select(
        'id, description, owner, kind, due_on, confidence, excerpt, status, people!commitments_person_id_fkey(full_name, preferred_name)',
      )
      .eq('user_id', user.id)
      .eq('interaction_id', id)
      .eq('review_status', 'proposed'),
    supabase
      .from('decisions')
      .select('id, description, confidence, excerpt')
      .eq('user_id', user.id)
      .eq('interaction_id', id)
      .eq('review_status', 'proposed'),
  ])

  if (!conversation) return { ctx, data: null }

  // Memory proposals point at the generation that made them, which the
  // conversation row names.
  const { count: memories } = conversation.artifact_id
    ? await supabase
        .from('observations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'proposed')
        .eq('origin_artifact_id', conversation.artifact_id)
    : { count: 0 }

  const data: ReviewResponse = {
    conversation: {
      id: conversation.id,
      title: conversation.title ?? 'Conversation',
      occurredAt: conversation.occurred_at,
      summary: conversation.summary,
      outcome: conversation.outcome,
    },
    processing: conversation.processing_status,
    loops: (loops ?? []).map((l) => ({
      id: l.id,
      description: l.description,
      direction: actionDirection(l),
      owner: l.owner,
      kind: l.kind,
      dueOn: l.due_on,
      personName: l.people ? l.people.preferred_name || l.people.full_name : null,
      excerpt: l.excerpt,
      likely: Number(l.confidence ?? 0) >= LOOP_PRESELECT_THRESHOLD,
    })),
    decisions: (decisions ?? []).map((d) => ({
      id: d.id,
      description: d.description,
      excerpt: d.excerpt,
      likely: Number(d.confidence ?? 0) >= LOOP_PRESELECT_THRESHOLD,
    })),
    memoryProposals: memories ?? 0,
  }
  return { ctx, data }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)
  const { ctx, data } = await load(id)
  if (!ctx.ok) return ctx.response
  if (!data) return json({ error: 'not_found' }, 404)
  return json(data)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not_found' }, 404)
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const body = await readJson<ReviewRequest>(request)
  const form = new FormData()
  form.set('interactionId', id)
  for (const loopId of body?.keepLoops ?? []) form.append('keepLoop', String(loopId))
  for (const decisionId of body?.keepDecisions ?? [])
    form.append('keepDecision', String(decisionId))

  const state = await submitReview({}, form)
  if (state.error) return json({ error: state.error }, 400)
  const result: ReviewResult = { message: state.message ?? 'Saved.' }
  return json(result)
}
