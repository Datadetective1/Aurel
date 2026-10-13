import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ConversationDetailView } from '@/components/app/conversation-detail'
import type { Proposal } from '@/components/app/memory-review'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { resolveFaces } from '@/lib/conversations/avatars'
import { getConversation, listDecisions, listLoops } from '@/lib/conversations/queries'
import { loadConversationRoom } from '@/lib/conversations/room'
import { unknownSpeakers } from '@/lib/conversations/speakers'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()
  const { data } = await supabase
    .from('interactions')
    .select('title')
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()
  return { title: data?.title ?? 'Conversation', robots: { index: false, follow: false } }
}

/**
 * A CONVERSATION
 * =============================================================================
 * The result page. Who was there, what it was about, and what it left behind
 * -- as cards with faces, not as a document. The review gate sits at the top
 * while there is anything to review, then folds away.
 * =============================================================================
 */
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ new?: string }>
}) {
  const { id } = await params
  const { new: justCreated } = await searchParams
  const { user, profile } = await requireOnboardedUser()
  const timeZone = profile.timezone ?? 'UTC'
  const now = new Date()
  const supabase = await createClient()

  const conversation = await getConversation(supabase, user.id, id)
  if (!conversation) notFound()

  const [
    { data: row },
    proposedLoops,
    confirmedLoops,
    proposedDecisions,
    confirmedDecisions,
    { data: proposedObservations },
    { data: allPeople },
    { data: artifact },
  ] = await Promise.all([
    supabase
      .from('interactions')
      .select('raw_notes, transcript, went_well, artifact_id, meetings(id, title, objective)')
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle(),
    listLoops(supabase, user.id, { interactionId: id, scope: 'proposed', timeZone, now }),
    listLoops(supabase, user.id, { interactionId: id, scope: 'all', timeZone, now }),
    listDecisions(supabase, user.id, { interactionId: id, scope: 'proposed' }),
    listDecisions(supabase, user.id, { interactionId: id, scope: 'confirmed' }),
    supabase
      .from('observation_sources')
      .select(
        'excerpt, observations!inner(id, content, category, evidence_level, status, person_id, people(full_name, preferred_name))',
      )
      .eq('user_id', user.id)
      .eq('interaction_id', id),
    supabase
      .from('people')
      .select('id, full_name, preferred_name, avatar_url, avatar_path')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('full_name')
      .limit(200),
    conversation.processingStatus === 'ready'
      ? supabase
          .from('ai_artifacts')
          .select('grounded_fallback, content')
          .eq('user_id', user.id)
          .eq('subject_kind', 'interaction')
          .eq('subject_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const text = (row?.transcript ?? row?.raw_notes ?? '').trim()
  const roomPeople = await loadConversationRoom(supabase, user.id, id)
  const kept = confirmedLoops.filter((l) => l.reviewStatus === 'confirmed')
  const openKept = kept.filter((l) => l.status === 'open' || l.status === 'later')
  const closedKept = kept.filter((l) => l.status !== 'open' && l.status !== 'later')
  const pending = proposedLoops.length + proposedDecisions.length
  const showReview = conversation.processingStatus === 'ready' && pending > 0

  const faces = await resolveFaces(supabase, allPeople ?? [], (p) => p.id)
  const participantIds = new Set(conversation.participants.map((p) => p.id))
  const pickable = (allPeople ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    preferredName: p.preferred_name,
    src: faces.get(p.id) ?? null,
  }))
  const participantPeople = pickable.filter((p) => participantIds.has(p.id))
  const loopPeople = conversation.participants.map((p) => ({ id: p.id, name: p.name }))

  // Speakers the transcript names who are not in the room. Suggested, never
  // added on their own.
  const speakerSuggestions = unknownSpeakers(text, {
    userNames: [profile.full_name, profile.preferred_name],
    participants: participantPeople,
    people: pickable,
  })

  // Memory proposals from this conversation, grouped by person, reusing the
  // person page's own gate so the two never disagree about what a proposal is.
  const memoryByPerson = new Map<string, { name: string; proposals: Proposal[] }>()
  for (const src of proposedObservations ?? []) {
    const o = src.observations
    if (!o || o.status !== 'proposed') continue
    const name = o.people?.preferred_name || o.people?.full_name || 'Someone'
    const entry = memoryByPerson.get(o.person_id) ?? { name, proposals: [] }
    entry.proposals.push({
      id: o.id,
      content: o.content,
      evidenceLevel: o.evidence_level,
      category: o.category,
      basis: `From "${conversation.title}"`,
      excerpt: src.excerpt,
    })
    memoryByPerson.set(o.person_id, entry)
  }

  const nextTime = ((artifact?.content as { nextTime?: string[] } | null)?.nextTime ?? []).slice(
    0,
    4,
  )
  const objections = (
    (artifact?.content as { objections?: string[] } | null)?.objections ?? []
  ).slice(0, 4)

  return (
    <ConversationDetailView
      id={id}
      justCreated={Boolean(justCreated)}
      conversation={conversation}
      meeting={row?.meetings ? { id: row.meetings.id, title: row.meetings.title } : null}
      wentWell={row?.went_well ?? null}
      timeZone={timeZone}
      now={now}
      roomPeople={roomPeople}
      participantPeople={participantPeople}
      pickable={pickable}
      speakerSuggestions={speakerSuggestions}
      proposedLoops={proposedLoops}
      proposedDecisions={proposedDecisions}
      confirmedDecisions={confirmedDecisions}
      openKept={openKept}
      closedKept={closedKept}
      keptCount={kept.length}
      pending={pending}
      showReview={showReview}
      loopPeople={loopPeople}
      memoryByPerson={memoryByPerson}
      nextTime={nextTime}
      objections={objections}
      text={text}
      grounded={artifact ? artifact.grounded_fallback : null}
    />
  )
}
