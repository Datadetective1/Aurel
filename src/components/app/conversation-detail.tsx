import Link from 'next/link'
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
import { formatDate, formatTime, pluralise } from '@/lib/format'
import { brand } from '@/lib/brand'

import type { ConversationSummary, DecisionRecord, LoopRecord } from '@/lib/conversations/queries'
import type { RoomPerson } from '@/components/app/room-strip'
import type { ComponentProps } from 'react'

type PickablePerson = ComponentProps<typeof ConversationParticipants>['people'][number]
type SpeakerSuggestions = ComponentProps<typeof ConversationParticipants>['suggestions']

export interface ConversationDetailProps {
  id: string
  justCreated: boolean
  conversation: ConversationSummary & { participants: { id: string; name: string; src: string | null }[] }
  meeting: { id: string; title: string } | null
  wentWell: number | null
  timeZone: string
  now: Date
  roomPeople: RoomPerson[]
  participantPeople: PickablePerson[]
  pickable: PickablePerson[]
  speakerSuggestions: SpeakerSuggestions
  proposedLoops: LoopRecord[]
  proposedDecisions: DecisionRecord[]
  confirmedDecisions: DecisionRecord[]
  openKept: LoopRecord[]
  closedKept: LoopRecord[]
  keptCount: number
  pending: number
  showReview: boolean
  loopPeople: { id: string; name: string }[]
  memoryByPerson: Map<string, { name: string; proposals: Proposal[] }>
  nextTime: string[]
  objections: string[]
  text: string
  grounded: boolean | null
}

/**
 * A CONVERSATION
 * =============================================================================
 * The result page's presentation, separated from its data so the visual
 * preview renders exactly what the signed-in page renders.
 * =============================================================================
 */
export function ConversationDetailView({
  id,
  justCreated,
  conversation,
  meeting,
  wentWell,
  timeZone,
  now,
  roomPeople,
  participantPeople,
  pickable,
  speakerSuggestions,
  proposedLoops,
  proposedDecisions,
  confirmedDecisions,
  openKept,
  closedKept,
  keptCount,
  pending,
  showReview,
  loopPeople,
  memoryByPerson,
  nextTime,
  objections,
  text,
  grounded,
}: ConversationDetailProps) {
  return (
    <Container size="default" className="py-8 sm:py-12">
      <Button asChild variant="quiet" size="sm" className="-ml-3">
        <Link href={meeting ? `/meetings/${meeting.id}/brief` : '/conversations'}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {meeting ? 'Back to brief' : 'Conversations'}
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
            {meeting ? (
              <Badge tone="outline">
                <CalendarClock className="size-3" aria-hidden="true" />
                {meeting.title}
              </Badge>
            ) : null}
            {wentWell ? (
              <Badge tone="outline">
                Went {['badly', 'not great', 'fine', 'well', 'very well'][wentWell - 1]}
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
          {keptCount > 0 ? (
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
          {grounded !== null ? (
            grounded ? (
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
