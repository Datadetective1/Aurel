import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Handshake,
  Loader2,
  Scale,
  Sparkles,
} from 'lucide-react'
import { SOURCE_LABEL } from '@/components/app/conversation-card'
import {
  DeleteConversationButton,
  ReprocessButton,
  RetitleForm,
} from '@/components/app/conversation-controls'
import { ConversationParticipants } from '@/components/app/conversation-participants'
import { ConversationReview } from '@/components/app/conversation-review'
import { Illustration } from '@/components/brand/illustrations'
import { RoomStrip } from '@/components/app/room-strip'
import { LoopList } from '@/components/app/loop-list'
import { AddLoop } from '@/components/app/add-loop'
import { MemoryReview, type Proposal } from '@/components/app/memory-review'
import { TranscriptView } from '@/components/app/transcript-view'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge, Container, Eyebrow, Rule } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { resolveFaces } from '@/lib/conversations/avatars'
import { getConversation, listDecisions, listLoops } from '@/lib/conversations/queries'
import { loadConversationRoom } from '@/lib/conversations/room'
import { unknownSpeakers } from '@/lib/conversations/speakers'
import { formatDate, formatTime, pluralise } from '@/lib/format'
import { brand } from '@/lib/brand'

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
    <Container size="default" className="py-8 sm:py-12">
      <Button asChild variant="quiet" size="sm" className="-ml-3">
        <Link href={row?.meetings ? `/meetings/${row.meetings.id}/brief` : '/conversations'}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {row?.meetings ? 'Back to brief' : 'Conversations'}
        </Link>
      </Button>

      {justCreated && conversation.processingStatus === 'ready' ? (
        <p
          role="status"
          className="border-line bg-bg-sunken text-ink-secondary mt-6 flex items-start gap-2.5 rounded-[var(--radius-md)] border px-4 py-3 text-sm leading-relaxed"
        >
          <CircleCheck className="text-positive mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Kept.{' '}
            {pending > 0
              ? `${brand.name} found ${pluralise(pending, 'thing')} worth confirming below.`
              : 'Nothing was left open that needs confirming.'}
          </span>
        </p>
      ) : null}

      {/* --- header --------------------------------------------------------------- */}
      <header className="mt-5">
        <Eyebrow>
          {formatDate(conversation.occurredAt, timeZone)} ·{' '}
          {formatTime(conversation.occurredAt, timeZone)}
          {conversation.durationSeconds
            ? ` · ${Math.max(1, Math.round(conversation.durationSeconds / 60))} min`
            : ''}
        </Eyebrow>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-ink text-3xl sm:text-4xl">{conversation.title}</h1>
          <RetitleForm interactionId={id} title={conversation.title} />
        </div>

        {/* Who this was with, as faces. A one-to-one gets a portrait with the
            person's role and company; a few people get cards; a crowd gets a
            stack. A conversation nobody is attached to yet says so with a
            drawing, not a blank. */}
        <div className="border-line bg-surface mt-5 rounded-[var(--radius-lg)] border p-4 sm:p-5">
          {roomPeople.length > 0 ? (
            <RoomStrip
              people={roomPeople}
              hero={roomPeople.length === 1}
              eyebrow={roomPeople.length === 1 ? 'With' : undefined}
            />
          ) : (
            <div className="flex items-center gap-4">
              <Illustration subject="faces" className="w-28 shrink-0" />
              <p className="text-ink-muted text-sm leading-relaxed">
                Nobody is attached to this conversation yet. Add who it was with and the promises
                and questions below will follow them.
              </p>
            </div>
          )}
          <ConversationParticipants
            className="mt-4"
            interactionId={id}
            participants={participantPeople}
            people={pickable}
            suggestions={speakerSuggestions}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{SOURCE_LABEL[conversation.sourceKind]}</Badge>
            {row?.meetings ? (
              <Badge tone="outline">
                <CalendarClock className="size-3" aria-hidden="true" />
                {row.meetings.title}
              </Badge>
            ) : null}
            {row?.went_well ? (
              <Badge tone="outline">
                Went {['badly', 'not great', 'fine', 'well', 'very well'][row.went_well - 1]}
              </Badge>
            ) : null}
            {conversation.topics.slice(0, 4).map((t) => (
              <Badge key={t} tone="outline">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      </header>

      {/* --- processing states ---------------------------------------------------- */}
      {conversation.processingStatus === 'pending' ||
      conversation.processingStatus === 'processing' ? (
        <p
          role="status"
          className="border-line bg-surface text-ink-secondary mt-8 flex items-center gap-2.5 rounded-[var(--radius-md)] border px-4 py-3 text-sm"
        >
          <Loader2 className="text-ink-faint size-4 animate-spin" aria-hidden="true" />
          Reading this conversation…
          <ReprocessButton interactionId={id} label="Check again" />
        </p>
      ) : null}

      {conversation.processingStatus === 'failed' ? (
        <div className="border-caution/25 bg-caution-wash mt-8 rounded-[var(--radius-md)] border px-4 py-3">
          <p className="text-ink-secondary flex items-start gap-2 text-sm">
            <CircleAlert className="text-caution mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {conversation.processingError ?? 'The automatic reading did not run.'} Your words are
            safe below.
          </p>
          <div className="mt-3">
            <ReprocessButton interactionId={id} />
          </div>
        </div>
      ) : null}

      {/* --- review gate ------------------------------------------------------------ */}
      {/* Mounted even with nothing to review: it renders nothing then, but
          after a submit the page revalidates with zero proposals, and the
          confirmation the user is reading must not vanish with them. */}
      {conversation.processingStatus === 'ready' ? (
        <ConversationReview
          className="mt-8"
          interactionId={id}
          loops={proposedLoops}
          decisions={proposedDecisions}
          participants={conversation.participants}
        />
      ) : null}

      {/* --- summary ------------------------------------------------------------------ */}
      {conversation.summary ? (
        <>
          <Rule />
          <section>
            <Eyebrow>What it was about</Eyebrow>
            <p className="text-ink mt-3 max-w-2xl text-base leading-relaxed">
              {conversation.summary}
            </p>
            {conversation.outcome ? (
              <p className="text-ink-secondary mt-3 max-w-2xl text-sm leading-relaxed">
                <span className="text-ink-muted">Upshot — </span>
                {conversation.outcome}
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      {/* --- what it left open ----------------------------------------------------- */}
      <Rule />
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>What it left open</Eyebrow>
            <h2 className="font-display text-ink mt-2 text-xl">
              {openKept.length === 0
                ? 'Nothing open'
                : `${openKept.length} open ${openKept.length === 1 ? 'loop' : 'loops'}`}
            </h2>
          </div>
          {kept.length > 0 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/loops">
                All open loops
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>

        {openKept.length > 0 ? (
          <LoopList
            className="mt-5"
            loops={openKept}
            timeZone={timeZone}
            now={now}
            showSource={false}
          />
        ) : showReview ? (
          <p className="text-ink-muted mt-3 text-sm">
            Confirm what is real above and it will appear here.
          </p>
        ) : (
          <div className="border-line mt-4 flex items-center gap-4 rounded-[var(--radius-md)] border border-dashed px-4 py-3">
            <Handshake className="text-ink-faint size-5 shrink-0" aria-hidden="true" />
            <p className="text-ink-muted text-sm">
              No promises or questions were kept from this conversation.
            </p>
          </div>
        )}

        {closedKept.length > 0 ? (
          <details className="mt-4">
            <summary className="text-ink-muted hover:text-ink cursor-pointer text-xs">
              {pluralise(closedKept.length, 'closed loop')}
            </summary>
            <LoopList
              className="mt-3"
              loops={closedKept}
              timeZone={timeZone}
              now={now}
              showSource={false}
              grouped={false}
            />
          </details>
        ) : null}

        <div className="mt-4">
          <AddLoop
            people={loopPeople}
            defaultPersonId={loopPeople[0]?.id ?? ''}
            interactionId={id}
          />
        </div>
      </section>

      {/* --- decisions ------------------------------------------------------------------ */}
      {confirmedDecisions.length > 0 ? (
        <>
          <Rule />
          <section>
            <Eyebrow>Decided</Eyebrow>
            <ul className="mt-4 grid gap-3">
              {confirmedDecisions.map((d) => (
                <li
                  key={d.id}
                  className="border-line bg-surface flex gap-3 rounded-[var(--radius-md)] border p-4"
                >
                  <Scale className="text-positive mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-ink text-sm leading-relaxed">{d.description}</p>
                    {d.context ? (
                      <p className="text-ink-secondary mt-1 text-xs leading-relaxed">
                        <span className="text-ink-muted">Because — </span>
                        {d.context}
                      </p>
                    ) : null}
                    <div className="text-ink-muted mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span>{formatDate(d.decidedOn, timeZone)}</span>
                      {d.people.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5">
                          {d.people.slice(0, 4).map((p) => (
                            <Link key={p.id} href={`/people/${p.id}`} aria-label={p.name}>
                              <Avatar name={p.name} src={p.src} size="xs" />
                            </Link>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {/* --- pushback ------------------------------------------------------------------- */}
      {objections.length > 0 ? (
        <>
          <Rule />
          <section>
            <Eyebrow>Pushback</Eyebrow>
            <ul className="mt-3 grid gap-2.5">
              {objections.map((o) => (
                <li key={o} className="text-ink-secondary flex gap-3 text-sm leading-relaxed">
                  <span aria-hidden="true" className="bg-caution mt-2.5 h-px w-3 shrink-0" />
                  {o}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {/* --- memory ---------------------------------------------------------------------- */}
      {memoryByPerson.size > 0 ? (
        <>
          <Rule />
          <section className="grid gap-4">
            {[...memoryByPerson.entries()].map(([personId, entry]) => (
              <MemoryReview key={personId} proposals={entry.proposals} personName={entry.name} />
            ))}
          </section>
        </>
      ) : null}

      {/* --- next time ------------------------------------------------------------------- */}
      {nextTime.length > 0 ? (
        <>
          <Rule />
          <section className="border-accent/25 bg-accent-wash rounded-[var(--radius-lg)] border p-5">
            <Eyebrow className="text-accent">Next time</Eyebrow>
            <ol className="mt-3 grid gap-2.5">
              {nextTime.map((n, i) => (
                <li key={i} className="text-ink flex gap-2.5 text-sm leading-relaxed">
                  <span aria-hidden="true" className="font-display text-accent tabular-nums">
                    {i + 1}
                  </span>
                  {n}
                </li>
              ))}
            </ol>
            {conversation.participants[0] ? (
              <Button asChild size="sm" className="mt-5">
                <Link href={`/prepare?person=${conversation.participants[0].id}`}>
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  Prepare for {conversation.participants[0].name.split(' ')[0]}
                </Link>
              </Button>
            ) : null}
          </section>
        </>
      ) : null}

      {/* --- the words ------------------------------------------------------------------- */}
      {text ? (
        <>
          <Rule />
          <TranscriptView
            text={text}
            label={conversation.sourceKind === 'typed_notes' ? 'Your notes' : 'Transcript'}
          />
        </>
      ) : null}

      {/* --- provenance and controls ---------------------------------------------------------- */}
      <div className="border-line mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <p className="text-ink-faint flex items-center gap-2 text-xs">
          {artifact ? (
            artifact.grounded_fallback ? (
              <>
                <CircleHelp className="size-3.5" aria-hidden="true" />
                Read directly from your words, without a model.
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" aria-hidden="true" />
                Read by a model from your words. Every item above quotes its source.
              </>
            )
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {conversation.processingStatus === 'ready' ? (
            <ReprocessButton interactionId={id} />
          ) : null}
          <DeleteConversationButton interactionId={id} />
        </div>
      </div>
    </Container>
  )
}
