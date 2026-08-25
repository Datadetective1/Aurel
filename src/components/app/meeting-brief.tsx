import Link from 'next/link'
import {
  CircleAlert,
  CircleHelp,
  ClipboardCheck,
  MessageCircleQuestion,
  Quote,
  Target,
  Users,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Eyebrow, Panel } from '@/components/ui/primitives'
import { EvidenceBadge } from './evidence'
import { ApertureRule } from '@/components/brand/aperture'
import type { MeetingBrief } from '@/lib/ai/prompts/meeting-brief'
import type { Database } from '@/lib/supabase/types'
import { brand } from '@/lib/brand'

type EvidenceLevel = Database['public']['Enums']['evidence_level']

export interface BriefCitation {
  label: string
  evidenceLevel: EvidenceLevel
  personId: string | null
}

/**
 * THE MEETING BRIEF
 * =============================================================================
 * Ordered the way a person actually uses it: the sixty-second version first, so
 * someone walking down a corridor gets value before they stop reading, then the
 * detail, then — deliberately last and never hidden — what Atturel does not know.
 * =============================================================================
 */
export function MeetingBriefView({
  brief,
  citations,
  grounded,
  meetingId,
}: {
  brief: MeetingBrief
  citations: BriefCitation[]
  grounded: boolean
  meetingId: string
}) {
  return (
    <div className="grid gap-10">
      {/* --- 60 second brief ------------------------------------------------- */}
      <Panel className="border-accent/25 bg-accent-wash p-6 sm:p-7">
        <Eyebrow className="text-accent">The 60-second version</Eyebrow>
        <p className="mt-3 font-display text-xl leading-snug text-ink sm:text-2xl">
          {brief.sixtySecond}
        </p>
      </Panel>

      {/* --- objective -------------------------------------------------------- */}
      <section>
        <Eyebrow className="flex items-center gap-1.5">
          <Target className="size-3 text-accent" aria-hidden="true" />
          Your objective
        </Eyebrow>
        <p className="mt-3 text-sm leading-relaxed text-ink">{brief.objective}</p>
      </section>

      {/* --- approach --------------------------------------------------------- */}
      <section>
        <Eyebrow>Recommended approach</Eyebrow>
        <ol className="mt-4 grid gap-3">
          {brief.recommendedApproach.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-px font-display text-sm text-accent tabular-nums"
              >
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed text-ink">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* --- how to open ------------------------------------------------------ */}
      <section>
        <Eyebrow className="flex items-center gap-1.5">
          <Quote className="size-3 text-accent" aria-hidden="true" />
          How to open
        </Eyebrow>
        <blockquote className="mt-3 border-l-2 border-accent-graphic pl-4 text-sm leading-relaxed text-ink">
          {brief.howToOpen}
        </blockquote>
      </section>

      {/* --- the room --------------------------------------------------------- */}
      {brief.participants.length > 0 ? (
        <section>
          <Eyebrow className="flex items-center gap-1.5">
            <Users className="size-3 text-accent" aria-hidden="true" />
            People in the room
          </Eyebrow>

          <div className="mt-5 grid gap-4">
            {brief.participants.map((participant) => (
              <Panel key={participant.personId} className="p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <Avatar name={participant.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/people/${participant.personId}`}
                      className="font-medium text-ink hover:text-accent"
                    >
                      {participant.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-muted">{participant.relevance}</p>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                  {participant.relationshipNote}
                </p>

                {participant.whatMatters.length > 0 ? (
                  <BriefList label="What matters to them" items={participant.whatMatters} />
                ) : null}

                {participant.guidance.length > 0 ? (
                  <BriefList label="How to approach them" items={participant.guidance} accent />
                ) : null}

                {participant.knownConcerns.length > 0 ? (
                  <BriefList label="Concerns they have raised" items={participant.knownConcerns} />
                ) : null}
              </Panel>
            ))}
          </div>
        </section>
      ) : null}

      {/* --- room dynamics ---------------------------------------------------- */}
      {brief.roomDynamics ? (
        <section>
          <Eyebrow>Room dynamics</Eyebrow>

          {brief.roomDynamics.decisionOwner ? (
            <p className="mt-3 text-sm text-ink">
              <span className="text-ink-muted">Decision sits with — </span>
              {brief.roomDynamics.decisionOwner}
            </p>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">
              No decision owner is recorded. Worth establishing who decides before you present.
            </p>
          )}

          {brief.roomDynamics.sequencing.length > 0 ? (
            <div className="mt-5">
              <p className="text-sm font-medium text-ink">Suggested sequence</p>
              <ol className="mt-3 grid gap-2.5 border-l border-line pl-5">
                {brief.roomDynamics.sequencing.map((step, i) => (
                  <li key={i} className="relative text-sm leading-relaxed text-ink-secondary">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[1.4375rem] top-2 size-1.5 rounded-full bg-accent-graphic ring-4 ring-bg"
                    />
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {brief.roomDynamics.informationNeeds.length > 0 ? (
              <BriefList label="What each person needs to see" items={brief.roomDynamics.informationNeeds} />
            ) : null}
            {brief.roomDynamics.unresolvedIssues.length > 0 ? (
              <BriefList label="Still unresolved" items={brief.roomDynamics.unresolvedIssues} />
            ) : null}
            {brief.roomDynamics.knownDisagreements.length > 0 ? (
              <BriefList label="Known disagreements" items={brief.roomDynamics.knownDisagreements} />
            ) : null}
          </div>
        </section>
      ) : null}

      <ApertureRule />

      {/* --- emphasise / avoid ------------------------------------------------- */}
      <section className="grid gap-8 sm:grid-cols-2">
        {brief.emphasize.length > 0 ? (
          <BriefList label="Emphasise" items={brief.emphasize} accent />
        ) : null}
        {brief.avoid.length > 0 ? <BriefList label="Avoid" items={brief.avoid} /> : null}
      </section>

      {/* --- objections -------------------------------------------------------- */}
      {brief.likelyObjections.length > 0 ? (
        <section>
          <Eyebrow>Likely objections</Eyebrow>
          <div className="mt-4 grid gap-4">
            {brief.likelyObjections.map((objection, i) => (
              <Panel key={i} className="p-5">
                <p className="text-sm font-medium text-ink">{objection.objection}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                  {objection.response}
                </p>
                <p className="mt-2.5 text-[0.6875rem] text-ink-faint">{objection.basis}</p>
              </Panel>
            ))}
          </div>
        </section>
      ) : null}

      {/* --- questions --------------------------------------------------------- */}
      {brief.questionsYouMayGet.length > 0 ? (
        <section>
          <Eyebrow className="flex items-center gap-1.5">
            <MessageCircleQuestion className="size-3 text-accent" aria-hidden="true" />
            Questions you may get
          </Eyebrow>
          <dl className="mt-4 grid gap-4">
            {brief.questionsYouMayGet.map((item, i) => (
              <div key={i}>
                <dt className="text-sm font-medium text-ink">{item.question}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-ink-secondary">{item.response}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {brief.questionsToAsk.length > 0 ? (
        <BriefList label="Questions you should ask" items={brief.questionsToAsk} />
      ) : null}

      {/* --- outcome ----------------------------------------------------------- */}
      <section>
        <Eyebrow>Leave with</Eyebrow>
        <p className="mt-3 font-display text-lg leading-snug text-ink">{brief.outcomeToLeaveWith}</p>
      </section>

      {/* --- checklist ---------------------------------------------------------- */}
      {brief.checklist.length > 0 ? (
        <section>
          <Eyebrow className="flex items-center gap-1.5">
            <ClipboardCheck className="size-3 text-accent" aria-hidden="true" />
            Before you walk in
          </Eyebrow>
          <ul className="mt-4 grid gap-2">
            {brief.checklist.map((item, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-2.5 text-sm text-ink"
              >
                <span
                  aria-hidden="true"
                  className="size-3.5 shrink-0 rounded-[3px] border border-line-strong"
                />
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ApertureRule />

      {/* --- uncertainties: deliberately prominent ------------------------------ */}
      {brief.uncertainties.length > 0 ? (
        <section className="rounded-[var(--radius-lg)] border border-caution/25 bg-caution-wash p-5 sm:p-6">
          <Eyebrow className="flex items-center gap-1.5 text-caution">
            <CircleHelp className="size-3" aria-hidden="true" />
            What {brand.name} doesn&rsquo;t know
          </Eyebrow>
          <ul className="mt-4 grid gap-2.5">
            {brief.uncertainties.map((item, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-secondary">
                <span aria-hidden="true" className="mt-2 h-px w-3 shrink-0 bg-caution/50" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* --- evidence ------------------------------------------------------------ */}
      <section>
        <Eyebrow>Why {brand.name} is recommending this</Eyebrow>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          {grounded
            ? 'Composed directly from the records below. No language model was involved.'
            : 'Generated from the records below.'}
        </p>

        {citations.length > 0 ? (
          <ul className="mt-4 grid gap-2">
            {citations.map((citation, i) => (
              <li
                key={i}
                className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 text-sm leading-relaxed text-ink-secondary">
                  {citation.label}
                </span>
                <EvidenceBadge level={citation.evidenceLevel} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-line bg-bg-sunken px-4 py-3 text-sm text-ink-secondary">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
            There was no recorded evidence to build on, so this brief is based on the meeting
            details alone. It will get much sharper once you log interactions with these people.
          </p>
        )}
      </section>

      <p className="text-xs text-ink-faint">
        <Link href={`/meetings/${meetingId}/debrief`} className="text-accent hover:underline">
          After the meeting, debrief it
        </Link>{' '}
        — that is what makes the next brief better.
      </p>
    </div>
  )
}

function BriefList({
  label,
  items,
  accent = false,
}: {
  label: string
  items: string[]
  accent?: boolean
}) {
  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-ink">{label}</p>
      <ul className="mt-2.5 grid gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-secondary">
            <span
              aria-hidden="true"
              className={`mt-2 h-px w-3 shrink-0 ${accent ? 'bg-accent-graphic' : 'bg-line-strong'}`}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * QUICK BRIEF — the mobile five-minutes-before surface.
 *
 * A different composition, not a shrunken desktop brief: only what you can act
 * on while walking into a room, in one short scroll.
 */
export function QuickBriefView({ brief }: { brief: MeetingBrief }) {
  return (
    <div className="grid gap-6">
      <section>
        <Eyebrow>Objective</Eyebrow>
        <p className="mt-2 text-base leading-relaxed text-ink">{brief.objective}</p>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-accent/25 bg-accent-wash p-4">
        <Eyebrow className="text-accent">Remember</Eyebrow>
        <ol className="mt-3 grid gap-2.5">
          {brief.recommendedApproach.slice(0, 3).map((step, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink">
              <span aria-hidden="true" className="font-display text-accent tabular-nums">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <Eyebrow>Open with</Eyebrow>
        <blockquote className="mt-2 border-l-2 border-accent-graphic pl-3 text-sm leading-relaxed text-ink">
          {brief.howToOpen}
        </blockquote>
      </section>

      {brief.participants.length > 0 ? (
        <section>
          <Eyebrow>The room</Eyebrow>
          <ul className="mt-3 grid gap-3">
            {brief.participants.map((participant) => (
              <li key={participant.personId} className="flex gap-3">
                <Avatar name={participant.name} size="xs" className="mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{participant.name}</p>
                  {participant.guidance[0] ? (
                    <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-secondary">
                      {participant.guidance[0]}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {brief.likelyObjections[0] ? (
        <section>
          <Eyebrow>Likely objection</Eyebrow>
          <p className="mt-2 text-sm leading-relaxed text-ink">
            {brief.likelyObjections[0].objection}
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-secondary">
            {brief.likelyObjections[0].response}
          </p>
        </section>
      ) : null}

      <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-4">
        <Eyebrow>Leave with</Eyebrow>
        <p className="mt-2 text-sm leading-relaxed text-ink">{brief.outcomeToLeaveWith}</p>
      </section>

      {brief.uncertainties[0] ? (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
          <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-caution" aria-hidden="true" />
          {brief.uncertainties[0]}
        </p>
      ) : null}
    </div>
  )
}
