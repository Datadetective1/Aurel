import Link from 'next/link'
import {
  ChevronDown,
  FileText,
  UserPlus,
  Users,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Handshake,
  Loader2,
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
import { LoopList } from '@/components/app/loop-list'
import { AddLoop } from '@/components/app/add-loop'
import { MemoryReview, type Proposal } from '@/components/app/memory-review'
import { TranscriptView } from '@/components/app/transcript-view'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/primitives'
import { Chip, ChipRow } from '@/components/visual/chip'
import { ConversationOutcome, NextSteps } from '@/components/visual/conversation-outcome'
import { QuietEmpty } from '@/components/visual/quiet-empty'
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
  conversation: ConversationSummary & {
    participants: { id: string; name: string; src: string | null }[]
  }
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
  const pushback = objections
  const hasOutcome = confirmedDecisions.length > 0 || openKept.length > 0 || pushback.length > 0
  const minutes = conversation.durationSeconds
    ? Math.max(1, Math.round(conversation.durationSeconds / 60))
    : null

  return (
    <Container size="default" className="py-6 sm:py-10">
      <Button asChild variant="quiet" size="sm" className="-ml-3">
        <Link href={meeting ? `/meetings/${meeting.id}/brief` : '/conversations'}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {meeting ? 'Back to brief' : 'Conversations'}
        </Link>
      </Button>

      {justCreated && conversation.processingStatus === 'ready' ? (
        <p
          role="status"
          className="border-line bg-bg-sunken text-ink-secondary mt-4 flex items-start gap-2.5 rounded-[var(--radius-md)] border px-4 py-3 text-sm leading-relaxed"
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

      {/* --- who and when ---------------------------------------------------------- */}
      {/* Faces and a line of facts. Changing who was there is a tap away rather
          than a panel that sits over the content -- unless the transcript names
          somebody not yet in the room, which is worth showing straight away. */}
      <header className="mt-3">
        <p className="text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span>{formatDate(conversation.occurredAt, timeZone)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatTime(conversation.occurredAt, timeZone)}</span>
          {minutes ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{minutes} min</span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span>{SOURCE_LABEL[conversation.sourceKind]}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-ink text-2xl leading-tight sm:text-3xl">
            {conversation.title}
          </h1>
          <RetitleForm interactionId={id} title={conversation.title} />
        </div>

        {roomPeople.length > 0 ? (
          <ul aria-label="Who was there" className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {roomPeople.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/people/${p.id}`}
                  className="group flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  <Avatar name={p.fullName} src={p.src} size="md" />
                  <span className="min-w-0">
                    <span className="text-ink group-hover:text-accent block text-sm leading-tight font-medium">
                      {p.name}
                    </span>
                    {p.company || p.context ? (
                      <span className="text-ink-muted block text-xs leading-tight">
                        {p.company ?? p.context}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted mt-3 flex items-center gap-2 text-sm">
            <UserPlus className="size-4" aria-hidden="true" />
            Nobody attached yet
          </p>
        )}

        <ChipRow className="mt-3">
          {meeting ? (
            <Chip icon={CalendarClock} tone="quiet">
              {meeting.title}
            </Chip>
          ) : null}
          {wentWell ? (
            <Chip tone="neutral">
              Went {['badly', 'not great', 'fine', 'well', 'very well'][wentWell - 1]}
            </Chip>
          ) : null}
          {conversation.topics.slice(0, 3).map((t) => (
            <Chip key={t} tone="neutral">
              {t}
            </Chip>
          ))}
        </ChipRow>

        <details
          className="group mt-2"
          open={speakerSuggestions.length > 0 || roomPeople.length === 0}
        >
          <summary className="text-ink-muted hover:text-ink inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-xs [&::-webkit-details-marker]:hidden">
            <Users className="size-3.5" aria-hidden="true" />
            <span className="group-open:hidden">Change who was there</span>
            <span className="hidden group-open:inline">Done</span>
          </summary>
          <ConversationParticipants
            className="mt-1"
            interactionId={id}
            participants={participantPeople}
            people={pickable}
            suggestions={speakerSuggestions}
          />
        </details>
      </header>

      {/* --- processing states ---------------------------------------------------- */}
      {conversation.processingStatus === 'pending' ||
      conversation.processingStatus === 'processing' ? (
        <p
          role="status"
          className="border-line bg-surface text-ink-secondary mt-6 flex items-center gap-2.5 rounded-[var(--radius-md)] border px-4 py-3 text-sm"
        >
          <Loader2 className="text-ink-faint size-4 animate-spin" aria-hidden="true" />
          Reading this conversation…
          <ReprocessButton interactionId={id} label="Check again" />
        </p>
      ) : null}

      {conversation.processingStatus === 'failed' ? (
        <div className="border-caution/25 bg-caution-wash mt-6 rounded-[var(--radius-md)] border px-4 py-3">
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
          className="mt-6"
          interactionId={id}
          loops={proposedLoops}
          decisions={proposedDecisions}
          participants={conversation.participants}
        />
      ) : null}

      {/* --- what it left behind, as objects ---------------------------------------- */}
      {hasOutcome ? (
        <ConversationOutcome
          className="mt-6"
          loops={openKept}
          decisions={confirmedDecisions}
          objections={pushback}
          timeZone={timeZone}
          now={now}
        />
      ) : !showReview && conversation.processingStatus === 'ready' ? (
        <QuietEmpty
          className="mt-6"
          icon={Handshake}
          title="Nothing left open"
          body="No promises, questions or decisions were kept from this one."
        />
      ) : null}

      <NextSteps
        className="mt-6"
        items={nextTime}
        people={conversation.participants}
        prepareHref={
          conversation.participants[0] ? `/prepare?person=${conversation.participants[0].id}` : null
        }
        prepareLabel={
          conversation.participants[0]
            ? `Prepare for ${conversation.participants[0].name.split(' ')[0]}`
            : null
        }
      />

      {/* --- detail, on request ------------------------------------------------------- */}
      <div className="mt-6 grid gap-2">
        {conversation.summary ? (
          <Disclosure icon={FileText} label="Read summary">
            <p className="text-ink text-sm leading-relaxed">{conversation.summary}</p>
            {conversation.outcome ? (
              <p className="text-ink-secondary mt-2 text-sm leading-relaxed">
                <span className="text-ink-muted">Upshot — </span>
                {conversation.outcome}
              </p>
            ) : null}
          </Disclosure>
        ) : null}

        <Disclosure
          icon={Handshake}
          label={
            openKept.length > 0 ? `Manage ${pluralise(openKept.length, 'open loop')}` : 'Add a loop'
          }
        >
          {openKept.length > 0 ? (
            <LoopList loops={openKept} timeZone={timeZone} now={now} showSource={false} />
          ) : null}
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
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <AddLoop
              people={loopPeople}
              defaultPersonId={loopPeople[0]?.id ?? ''}
              interactionId={id}
            />
            {keptCount > 0 ? (
              <Link
                href="/loops"
                className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center gap-1 text-xs"
              >
                All open loops
                <ArrowRight className="size-3" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </Disclosure>
      </div>

      {/* --- memory ---------------------------------------------------------------------- */}
      {memoryByPerson.size > 0 ? (
        <section className="mt-8 grid gap-4">
          {[...memoryByPerson.entries()].map(([personId, entry]) => (
            <MemoryReview key={personId} proposals={entry.proposals} personName={entry.name} />
          ))}
        </section>
      ) : null}

      {/* --- the words ------------------------------------------------------------------- */}
      {text ? (
        <div className="mt-2">
          <TranscriptView
            text={text}
            label={conversation.sourceKind === 'typed_notes' ? 'Your notes' : 'Transcript'}
          />
        </div>
      ) : null}

      {/* --- provenance and controls ---------------------------------------------------------- */}
      <div className="border-line mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
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
                Read by a model from your words. Every item quotes its source.
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

/** A quiet, full-width disclosure row: detail that is there when wanted. */
function Disclosure({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof FileText
  label: string
  children: React.ReactNode
}) {
  return (
    <details className="group border-line bg-surface rounded-[var(--radius-lg)] border">
      <summary className="text-ink flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-4 text-sm [&::-webkit-details-marker]:hidden">
        <Icon className="text-ink-muted size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">{label}</span>
        <ChevronDown
          className="text-ink-muted size-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-line border-t px-4 py-4">{children}</div>
    </details>
  )
}
