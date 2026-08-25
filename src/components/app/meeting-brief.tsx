import Link from 'next/link'
import {
  CircleAlert,
  CircleHelp,
  ClipboardCheck,
  Globe,
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
        <p className="font-display text-ink mt-3 text-xl leading-snug sm:text-2xl">
          {brief.sixtySecond}
        </p>
      </Panel>

      {/* --- objective -------------------------------------------------------- */}
      <section>
        <Eyebrow className="flex items-center gap-1.5">
          <Target className="text-accent size-3" aria-hidden="true" />
          Your objective
        </Eyebrow>
        <p className="text-ink mt-3 text-sm leading-relaxed">{brief.objective}</p>
      </section>

      {/* --- approach --------------------------------------------------------- */}
      <section>
        <Eyebrow>Recommended approach</Eyebrow>
        <ol className="mt-4 grid gap-3">
          {brief.recommendedApproach.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span
                aria-hidden="true"
                className="font-display text-accent mt-px text-sm tabular-nums"
              >
                {i + 1}
              </span>
              <span className="text-ink text-sm leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* --- how to open ------------------------------------------------------ */}
      <section>
        <Eyebrow className="flex items-center gap-1.5">
          <Quote className="text-accent size-3" aria-hidden="true" />
          How to open
        </Eyebrow>
        <blockquote className="border-accent-graphic text-ink mt-3 border-l-2 pl-4 text-sm leading-relaxed">
          {brief.howToOpen}
        </blockquote>
      </section>

      {/* --- the room --------------------------------------------------------- */}
      {brief.participants.length > 0 ? (
        <section>
          <Eyebrow className="flex items-center gap-1.5">
            <Users className="text-accent size-3" aria-hidden="true" />
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
                      className="text-ink hover:text-accent font-medium"
                    >
                      {participant.name}
                    </Link>
                    <p className="text-ink-muted mt-0.5 text-xs">{participant.relevance}</p>
                  </div>
                </div>

                <p className="text-ink-muted mt-3 text-xs leading-relaxed">
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

                {/* Stored artifacts are cast, not re-parsed, so a brief
                    generated before these fields existed has neither. Guard
                    rather than crash on an old record. */}
                {(participant.publicContext ?? []).length > 0 ? (
                  <div className="border-line bg-bg-sunken mt-4 rounded-[var(--radius-md)] border px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <Globe className="text-ink-faint size-3 shrink-0" aria-hidden="true" />
                      <p className="label">From public sources</p>
                    </div>
                    <ul className="mt-2.5 grid gap-2">
                      {(participant.publicContext ?? []).map((item, index) => (
                        <li key={index} className="flex gap-2.5">
                          <span
                            aria-hidden="true"
                            className="bg-line-strong mt-2 h-px w-2.5 shrink-0"
                          />
                          <p className="text-ink-secondary text-[0.8125rem] leading-relaxed">
                            {item.statement}
                            {item.sourceLabel ? (
                              <span className="text-ink-faint"> · {item.sourceLabel}</span>
                            ) : null}
                          </p>
                        </li>
                      ))}
                    </ul>
                    {participant.publicOnly ? (
                      <p className="text-ink-muted mt-2.5 text-[0.6875rem] leading-relaxed">
                        This is who they are professionally, not how they work with you. Guidance
                        above is preliminary until you have met.
                      </p>
                    ) : null}
                  </div>
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
            <p className="text-ink mt-3 text-sm">
              <span className="text-ink-muted">Decision sits with — </span>
              {brief.roomDynamics.decisionOwner}
            </p>
          ) : (
            <p className="text-ink-muted mt-3 text-sm">
              No decision owner is recorded. Worth establishing who decides before you present.
            </p>
          )}

          {brief.roomDynamics.sequencing.length > 0 ? (
            <div className="mt-5">
              <p className="text-ink text-sm font-medium">Suggested sequence</p>
              <ol className="border-line mt-3 grid gap-2.5 border-l pl-5">
                {brief.roomDynamics.sequencing.map((step, i) => (
                  <li key={i} className="text-ink-secondary relative text-sm leading-relaxed">
                    <span
                      aria-hidden="true"
                      className="bg-accent-graphic ring-bg absolute top-2 -left-[1.4375rem] size-1.5 rounded-full ring-4"
                    />
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {brief.roomDynamics.informationNeeds.length > 0 ? (
              <BriefList
                label="What each person needs to see"
                items={brief.roomDynamics.informationNeeds}
              />
            ) : null}
            {brief.roomDynamics.unresolvedIssues.length > 0 ? (
              <BriefList label="Still unresolved" items={brief.roomDynamics.unresolvedIssues} />
            ) : null}
            {brief.roomDynamics.knownDisagreements.length > 0 ? (
              <BriefList
                label="Known disagreements"
                items={brief.roomDynamics.knownDisagreements}
              />
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
                <p className="text-ink text-sm font-medium">{objection.objection}</p>
                <p className="text-ink-secondary mt-2 text-sm leading-relaxed">
                  {objection.response}
                </p>
                <p className="text-ink-faint mt-2.5 text-[0.6875rem]">{objection.basis}</p>
              </Panel>
            ))}
          </div>
        </section>
      ) : null}

      {/* --- questions --------------------------------------------------------- */}
      {brief.questionsYouMayGet.length > 0 ? (
        <section>
          <Eyebrow className="flex items-center gap-1.5">
            <MessageCircleQuestion className="text-accent size-3" aria-hidden="true" />
            Questions you may get
          </Eyebrow>
          <dl className="mt-4 grid gap-4">
            {brief.questionsYouMayGet.map((item, i) => (
              <div key={i}>
                <dt className="text-ink text-sm font-medium">{item.question}</dt>
                <dd className="text-ink-secondary mt-1 text-sm leading-relaxed">{item.response}</dd>
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
        <p className="font-display text-ink mt-3 text-lg leading-snug">
          {brief.outcomeToLeaveWith}
        </p>
      </section>

      {/* --- checklist ---------------------------------------------------------- */}
      {brief.checklist.length > 0 ? (
        <section>
          <Eyebrow className="flex items-center gap-1.5">
            <ClipboardCheck className="text-accent size-3" aria-hidden="true" />
            Before you walk in
          </Eyebrow>
          <ul className="mt-4 grid gap-2">
            {brief.checklist.map((item, i) => (
              <li
                key={i}
                className="border-line bg-surface text-ink flex items-center gap-3 rounded-[var(--radius-md)] border px-4 py-2.5 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="border-line-strong size-3.5 shrink-0 rounded-[3px] border"
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
        <section className="border-caution/25 bg-caution-wash rounded-[var(--radius-lg)] border p-5 sm:p-6">
          <Eyebrow className="text-caution flex items-center gap-1.5">
            <CircleHelp className="size-3" aria-hidden="true" />
            What {brand.name} doesn&rsquo;t know
          </Eyebrow>
          <ul className="mt-4 grid gap-2.5">
            {brief.uncertainties.map((item, i) => (
              <li key={i} className="text-ink-secondary flex gap-3 text-sm leading-relaxed">
                <span aria-hidden="true" className="bg-caution/50 mt-2 h-px w-3 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* --- evidence ------------------------------------------------------------ */}
      <section>
        <Eyebrow>Why {brand.name} is recommending this</Eyebrow>
        <p className="text-ink-muted mt-2 text-xs leading-relaxed">
          {grounded
            ? 'Composed directly from the records below. No language model was involved.'
            : 'Generated from the records below.'}
        </p>

        {citations.length > 0 ? (
          <ul className="mt-4 grid gap-2">
            {citations.map((citation, i) => (
              <li
                key={i}
                className="border-line bg-surface flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-md)] border px-4 py-2.5"
              >
                <span className="text-ink-secondary min-w-0 flex-1 text-sm leading-relaxed">
                  {citation.label}
                </span>
                <EvidenceBadge level={citation.evidenceLevel} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-line bg-bg-sunken text-ink-secondary mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border px-4 py-3 text-sm">
            <CircleAlert className="text-ink-muted mt-0.5 size-4 shrink-0" aria-hidden="true" />
            There was no recorded evidence to build on, so this brief is based on the meeting
            details alone. It will get much sharper once you log interactions with these people.
          </p>
        )}
      </section>

      <p className="text-ink-faint text-xs">
        <Link
          href={`/meetings/${meetingId}/debrief`}
          className="text-accent decoration-accent/40 hover:decoration-accent underline underline-offset-2"
        >
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
      <p className="text-ink text-sm font-medium">{label}</p>
      <ul className="mt-2.5 grid gap-2">
        {items.map((item, i) => (
          <li key={i} className="text-ink-secondary flex gap-2.5 text-sm leading-relaxed">
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
        <p className="text-ink mt-2 text-base leading-relaxed">{brief.objective}</p>
      </section>

      <section className="border-accent/25 bg-accent-wash rounded-[var(--radius-lg)] border p-4">
        <Eyebrow className="text-accent">Remember</Eyebrow>
        <ol className="mt-3 grid gap-2.5">
          {brief.recommendedApproach.slice(0, 3).map((step, i) => (
            <li key={i} className="text-ink flex gap-2.5 text-sm leading-relaxed">
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
        <blockquote className="border-accent-graphic text-ink mt-2 border-l-2 pl-3 text-sm leading-relaxed">
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
                  <p className="text-ink text-sm font-medium">{participant.name}</p>
                  {participant.guidance[0] ? (
                    <p className="text-ink-secondary mt-0.5 text-[0.8125rem] leading-relaxed">
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
          <p className="text-ink mt-2 text-sm leading-relaxed">
            {brief.likelyObjections[0].objection}
          </p>
          <p className="text-ink-secondary mt-1.5 text-[0.8125rem] leading-relaxed">
            {brief.likelyObjections[0].response}
          </p>
        </section>
      ) : null}

      <section className="border-line bg-surface rounded-[var(--radius-lg)] border p-4">
        <Eyebrow>Leave with</Eyebrow>
        <p className="text-ink mt-2 text-sm leading-relaxed">{brief.outcomeToLeaveWith}</p>
      </section>

      {brief.uncertainties[0] ? (
        <p className="text-ink-muted flex items-start gap-2 text-xs leading-relaxed">
          <CircleHelp className="text-caution mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {brief.uncertainties[0]}
        </p>
      ) : null}
    </div>
  )
}
