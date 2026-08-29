import Link from 'next/link'
import {
  CircleAlert,
  CircleHelp,
  ClipboardCheck,
  Ear,
  Globe,
  MessageCircleQuestion,
  Quote,
  Target,
  Users,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Panel } from '@/components/ui/primitives'
import { EvidenceBadge } from './evidence'
import { ApertureRule } from '@/components/brand/aperture'
import type { ListeningCue, NormalizedBrief } from '@/lib/brief'
import type { Database } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'
import { brand } from '@/lib/brand'

type EvidenceLevel = Database['public']['Enums']['evidence_level']

export interface BriefCitation {
  label: string
  evidenceLevel: EvidenceLevel
  personId: string | null
}

/**
 * THE MEETING BRIEF, AT THREE DEPTHS
 * =============================================================================
 * One stored artifact, three arrangements of it:
 *
 *   GlanceBriefView   — ten seconds, on a phone, walking. Who, why, first line.
 *   QuickBriefView    — sixty seconds. The room, the pushback, the outcome.
 *   MeetingBriefView  — everything, with its evidence, read at a desk.
 *
 * None of them generates anything. The depths are presentation over an object
 * that already exists, which is why they render briefs written months ago.
 *
 * THE WEIGHT LADDER
 *
 * The full brief used to announce fourteen sections with the same small-caps
 * eyebrow at the same size, so nothing on the page said that the objective
 * mattered more than the checklist. Every section now declares a level and
 * `BriefSection` renders it — the ladder is enforced by the component rather
 * than by remembering, for the same reason `FormField` owns `aria-describedby`.
 *
 *   primary     what you act on          display serif, 20px
 *   supporting  what you should know     small-caps label, 11px
 *   reference   where it came from       small-caps label, muted
 *
 * "What Atturel doesn't know" sits outside the ladder deliberately. It is not
 * less important than the objective and not more; it is a different kind of
 * statement, and it keeps the caution treatment it already had.
 * =============================================================================
 */

type SectionLevel = 'primary' | 'supporting' | 'reference'

/**
 * A section of the brief, at a declared level.
 *
 * Headings are real headings. Every section used to open with an `Eyebrow`,
 * which renders a span, so the longest and densest screen in the product had
 * exactly one heading on it and no structure to navigate by.
 */
function BriefSection({
  level,
  title,
  icon,
  children,
  className,
}: {
  level: SectionLevel
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        level === 'primary' && 'mt-12 first:mt-0',
        level === 'supporting' && 'mt-9 first:mt-0',
        level === 'reference' && 'mt-8 first:mt-0',
        className,
      )}
    >
      {level === 'primary' ? (
        <h2 className="font-display text-ink flex items-center gap-2 text-xl">
          {icon}
          {title}
        </h2>
      ) : (
        <h2
          className={cn(
            'label flex items-center gap-1.5',
            level === 'reference' && 'text-ink-faint',
          )}
        >
          {icon}
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}

function BriefList({
  label,
  items,
  accent = false,
  level = 3,
  className,
}: {
  /** Omitted where the enclosing section heading already names the list. */
  label?: string
  items: string[]
  accent?: boolean
  /** Heading level, so the outline never skips a step. */
  level?: 3 | 4
  className?: string
}) {
  const Heading = level === 3 ? 'h3' : 'h4'
  return (
    <div className={cn('mt-4', className)}>
      {label ? <Heading className="text-ink text-sm font-medium">{label}</Heading> : null}
      <ul className={cn('grid gap-2', label && 'mt-2.5')}>
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
 * WHAT TO LISTEN FOR.
 *
 * Every line is something already open in the record — an unresolved issue, a
 * promise still outstanding, or a person there is no record of. The lead
 * sentence is not decoration: it is the thing that keeps the section from being
 * read as a prediction, and it says plainly that no prediction is being made.
 *
 * Composed in `lib/brief`, never generated. See the note there.
 */
function ListeningSection({ cues, level }: { cues: ListeningCue[]; level: SectionLevel }) {
  if (cues.length === 0) return null

  return (
    <BriefSection
      level={level}
      title="What to listen for"
      icon={<Ear className={level === 'primary' ? 'text-accent size-4' : 'text-accent size-3'} aria-hidden="true" />}
    >
      <p className="text-ink-muted mt-2 text-xs leading-relaxed">
        Open in your record. {brand.name} is not predicting what anyone will say.
      </p>
      <ul className="mt-3.5 grid gap-3">
        {cues.map((cue, i) => (
          <li key={i} className="flex gap-2.5">
            <span aria-hidden="true" className="bg-accent-graphic mt-2 h-px w-3 shrink-0" />
            <span className="min-w-0">
              <span className="text-ink block text-sm leading-relaxed">{cue.text}</span>
              <span className="text-ink-muted mt-0.5 block text-[0.6875rem]">{cue.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </BriefSection>
  )
}

// =============================================================================
// TEN SECONDS
// =============================================================================

export interface GlanceAlert {
  text: string
  note: string
  tone: 'critical' | 'caution'
}

/**
 * THE GLANCE — designed for the seven minutes before, on a phone, walking.
 *
 * The test it has to pass: an unfamiliar reader names the objective, the room
 * and the one thing to remember inside fifteen seconds. Everything that does
 * not serve that is one tap away and not on this screen.
 *
 * Sized to sit inside a 375px viewport without scrolling wherever the content
 * allows it. Where it does not — a five-person room, a three-line objective —
 * it scrolls rather than truncating the opening line, because the opening line
 * is the single most useful sentence Atturel produces.
 */
export function GlanceBriefView({
  brief,
  room,
  alert,
}: {
  brief: NormalizedBrief
  /** The room, resolved by the page: brief participants, or the attendee list. */
  room: { id: string | null; name: string }[]
  /** The one warning worth interrupting for, if there is one. */
  alert: GlanceAlert | null
}) {
  // Exactly the things this view renders. It previously counted
  // `recommendedApproach`, which the glance does not show -- so a brief
  // carrying only an approach reported itself as having content and then
  // painted an empty screen.
  const hasAnything = Boolean(brief.objective || brief.howToOpen || room.length > 0 || alert)

  return (
    <div className="grid gap-6">
      {room.length > 0 ? (
        <section>
          <h2 className="label">In the room</h2>
          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2.5">
            {room.map((person, i) => (
              <li key={person.id ?? `${person.name}-${i}`} className="flex items-center gap-2">
                <Avatar name={person.name} size="xs" />
                <span className="text-ink text-sm">{person.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {brief.objective ? (
        <section>
          <h2 className="label flex items-center gap-1.5">
            <Target className="text-accent size-3" aria-hidden="true" />
            You want
          </h2>
          <p className="font-display text-ink mt-2 text-xl leading-snug">{brief.objective}</p>
        </section>
      ) : null}

      {brief.howToOpen ? (
        <section>
          <h2 className="label flex items-center gap-1.5">
            <Quote className="text-accent size-3" aria-hidden="true" />
            Open with
          </h2>
          <blockquote className="border-accent-graphic text-ink mt-2 border-l-2 pl-3.5 text-sm leading-relaxed">
            {brief.howToOpen}
          </blockquote>
        </section>
      ) : null}

      {/* Only when there is one. A reserved slot that usually says "nothing
          overdue" trains the reader to skip the place the warning appears. */}
      {alert ? (
        <p
          className={cn(
            'flex items-start gap-2.5 rounded-[var(--radius-md)] border px-3.5 py-3',
            alert.tone === 'critical'
              ? 'border-critical/25 bg-critical-wash'
              : 'border-caution/25 bg-caution-wash',
          )}
        >
          <CircleAlert
            className={cn(
              'mt-0.5 size-4 shrink-0',
              alert.tone === 'critical' ? 'text-critical' : 'text-caution',
            )}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="text-ink block text-sm leading-relaxed">{alert.text}</span>
            <span className="text-ink-muted mt-0.5 block text-[0.6875rem]">{alert.note}</span>
          </span>
        </p>
      ) : null}

      {!hasAnything ? (
        <p className="text-ink-secondary text-sm leading-relaxed">
          This brief has no objective or opening recorded. Open the full brief to see what{' '}
          {brand.name} did find.
        </p>
      ) : null}
    </div>
  )
}

// =============================================================================
// SIXTY SECONDS
// =============================================================================

/**
 * QUICK BRIEF — a different composition, not a shrunken desktop brief.
 *
 * What the glance has, plus the three things that change how the conversation
 * goes: who is in the room and how to approach them, what they are likely to
 * push back on and why Atturel thinks so, and what is still open.
 */
export function QuickBriefView({
  brief,
  cues,
}: {
  brief: NormalizedBrief
  cues: ListeningCue[]
}) {
  return (
    <div className="grid gap-7">
      {brief.objective ? (
        <section>
          <h2 className="label">Objective</h2>
          <p className="text-ink mt-2 text-base leading-relaxed">{brief.objective}</p>
        </section>
      ) : null}

      {brief.recommendedApproach.length > 0 ? (
        <section className="border-accent/25 bg-accent-wash rounded-[var(--radius-lg)] border p-4">
          <h2 className="label text-accent">Remember</h2>
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
      ) : null}

      {brief.howToOpen ? (
        <section>
          <h2 className="label">Open with</h2>
          <blockquote className="border-accent-graphic text-ink mt-2 border-l-2 pl-3.5 text-sm leading-relaxed">
            {brief.howToOpen}
          </blockquote>
        </section>
      ) : null}

      {brief.participants.length > 0 ? (
        <section>
          <h2 className="label">The room</h2>
          <ul className="mt-3 grid gap-3.5">
            {brief.participants.map((participant, i) => (
              <li key={participant.personId ?? i} className="flex gap-3">
                <Avatar name={participant.name} size="xs" className="mt-0.5" />
                <div className="min-w-0">
                  <h3 className="text-ink text-sm font-medium">{participant.name}</h3>
                  {/* Guidance first: it is the actionable half. Where there is
                      none, the relationship note is the honest substitute --
                      usually "no history yet", which is worth saying out loud
                      rather than leaving the row silent. */}
                  {participant.guidance[0] ? (
                    <p className="text-ink-secondary mt-0.5 text-[0.8125rem] leading-relaxed">
                      {participant.guidance[0]}
                    </p>
                  ) : participant.relationshipNote ? (
                    <p className="text-ink-muted mt-0.5 text-[0.8125rem] leading-relaxed">
                      {participant.relationshipNote}
                    </p>
                  ) : null}
                  {participant.knownConcerns[0] ? (
                    <p className="text-ink-secondary mt-1 text-[0.8125rem] leading-relaxed">
                      <span className="text-ink-muted">Has raised — </span>
                      {participant.knownConcerns[0]}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {brief.likelyObjections.length > 0 ? (
        <section>
          <h2 className="label">
            {brief.likelyObjections.length === 1 ? 'Likely objection' : 'Likely objections'}
          </h2>
          <div className="mt-3 grid gap-4">
            {brief.likelyObjections.slice(0, 2).map((objection, i) => (
              <div key={i}>
                <h3 className="text-ink text-sm leading-relaxed font-medium">
                  {objection.objection}
                </h3>
                <p className="text-ink-secondary mt-1.5 text-[0.8125rem] leading-relaxed">
                  {objection.response}
                </p>
                {/* The basis was rendered at 11px in the faintest tone the
                    system has, on the one screen read while walking. It is the
                    difference between a guess and a citation, so it is legible
                    here. */}
                {objection.basis ? (
                  <p className="text-ink-muted mt-1.5 text-xs leading-relaxed">
                    {objection.basis}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {cues.length > 0 ? (
        <section>
          <h2 className="label flex items-center gap-1.5">
            <Ear className="text-accent size-3" aria-hidden="true" />
            What to listen for
          </h2>
          <p className="text-ink-muted mt-1.5 text-xs leading-relaxed">
            Open in your record. {brand.name} is not predicting what anyone will say.
          </p>
          <ul className="mt-3 grid gap-2.5">
            {cues.map((cue, i) => (
              <li key={i} className="flex gap-2.5">
                <span aria-hidden="true" className="bg-accent-graphic mt-2 h-px w-3 shrink-0" />
                <span className="min-w-0">
                  <span className="text-ink block text-sm leading-relaxed">{cue.text}</span>
                  <span className="text-ink-muted mt-0.5 block text-[0.6875rem]">{cue.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {brief.outcomeToLeaveWith ? (
        <section className="border-line bg-surface rounded-[var(--radius-lg)] border p-4">
          <h2 className="label">Leave with</h2>
          <p className="text-ink mt-2 text-sm leading-relaxed">{brief.outcomeToLeaveWith}</p>
        </section>
      ) : null}

      {brief.uncertainties.length > 0 ? (
        <section className="border-caution/25 bg-caution-wash rounded-[var(--radius-lg)] border p-4">
          <h2 className="label text-caution flex items-center gap-1.5">
            <CircleHelp className="size-3" aria-hidden="true" />
            What {brand.name} doesn&rsquo;t know
          </h2>
          <ul className="mt-3 grid gap-2">
            {brief.uncertainties.slice(0, 2).map((item, i) => (
              <li key={i} className="text-ink-secondary flex gap-2.5 text-[0.8125rem] leading-relaxed">
                <span aria-hidden="true" className="bg-caution/50 mt-2 h-px w-3 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

// =============================================================================
// EVERYTHING
// =============================================================================

export function MeetingBriefView({
  brief,
  citations,
  grounded,
  meetingId,
  cues,
}: {
  brief: NormalizedBrief
  citations: BriefCitation[]
  grounded: boolean
  meetingId: string
  cues: ListeningCue[]
}) {
  return (
    <div>
      {/* --- the lede ---------------------------------------------------------
          The `sixtySecond` FIELD keeps its name: it is in the prompt schema and
          in every stored artifact, and renaming it would orphan them.

          The LABEL had to change. "The 60-second version" was unambiguous while
          the brief had one depth. Adding a depth actually called "Sixty
          seconds" turned it into a contradiction: the reader selects
          Everything, the rail marks Everything, and then the first panel on the
          page announces itself as the shorter view they did not choose. The
          collision is a consequence of the depth rail, so it belongs to that
          work even though the string predates it.

          "In short" is what this paragraph is -- the lede of a long document,
          which is where it has always earned its place. */}
      {brief.sixtySecond ? (
        <Panel className="border-accent/25 bg-accent-wash p-6 sm:p-7">
          <h2 className="label text-accent">In short</h2>
          <p className="font-display text-ink mt-3 text-xl leading-snug sm:text-2xl">
            {brief.sixtySecond}
          </p>
        </Panel>
      ) : null}

      {/* --- PRIMARY: what you act on ---------------------------------------- */}
      {brief.objective ? (
        <BriefSection
          level="primary"
          title="Your objective"
          icon={<Target className="text-accent size-4" aria-hidden="true" />}
        >
          <p className="text-ink mt-3 text-base leading-relaxed">{brief.objective}</p>
        </BriefSection>
      ) : null}

      {brief.recommendedApproach.length > 0 ? (
        <BriefSection level="primary" title="Recommended approach">
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
        </BriefSection>
      ) : null}

      {brief.howToOpen ? (
        <BriefSection
          level="primary"
          title="How to open"
          icon={<Quote className="text-accent size-4" aria-hidden="true" />}
        >
          <blockquote className="border-accent-graphic text-ink mt-4 border-l-2 pl-4 text-base leading-relaxed">
            {brief.howToOpen}
          </blockquote>
        </BriefSection>
      ) : null}

      {brief.participants.length > 0 ? (
        <BriefSection
          level="primary"
          title="People in the room"
          icon={<Users className="text-accent size-4" aria-hidden="true" />}
        >
          <div className="mt-5 grid gap-4">
            {brief.participants.map((participant, index) => (
              <Panel key={participant.personId ?? index} className="p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <Avatar name={participant.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-ink font-medium">
                      {participant.personId ? (
                        <Link
                          href={`/people/${participant.personId}`}
                          className="hover:text-accent"
                        >
                          {participant.name}
                        </Link>
                      ) : (
                        participant.name
                      )}
                    </h3>
                    {participant.relevance ? (
                      <p className="text-ink-muted mt-0.5 text-xs">{participant.relevance}</p>
                    ) : null}
                  </div>
                </div>

                {participant.relationshipNote ? (
                  <p className="text-ink-muted mt-3 text-xs leading-relaxed">
                    {participant.relationshipNote}
                  </p>
                ) : null}

                {participant.whatMatters.length > 0 ? (
                  <BriefList
                    label="What matters to them"
                    items={participant.whatMatters}
                    level={4}
                  />
                ) : null}

                {participant.guidance.length > 0 ? (
                  <BriefList
                    label="How to approach them"
                    items={participant.guidance}
                    level={4}
                    accent
                  />
                ) : null}

                {participant.knownConcerns.length > 0 ? (
                  <BriefList
                    label="Concerns they have raised"
                    items={participant.knownConcerns}
                    level={4}
                  />
                ) : null}

                {participant.publicContext.length > 0 ? (
                  <div className="border-line bg-bg-sunken mt-4 rounded-[var(--radius-md)] border px-4 py-3.5">
                    <h4 className="label flex items-center gap-1.5">
                      <Globe className="text-ink-faint size-3 shrink-0" aria-hidden="true" />
                      From public sources
                    </h4>
                    <ul className="mt-2.5 grid gap-2">
                      {participant.publicContext.map((item, i) => (
                        <li key={i} className="flex gap-2.5">
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
        </BriefSection>
      ) : null}

      {brief.outcomeToLeaveWith ? (
        <BriefSection level="primary" title="Leave with">
          <p className="font-display text-ink mt-3 text-lg leading-snug">
            {brief.outcomeToLeaveWith}
          </p>
        </BriefSection>
      ) : null}

      <ApertureRule className="mt-12" />

      {/* --- SUPPORTING: what you should know -------------------------------- */}
      {brief.roomDynamics ? (
        <BriefSection level="supporting" title="Room dynamics">
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
              <h3 className="text-ink text-sm font-medium">Suggested sequence</h3>
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
                className="mt-0"
              />
            ) : null}
            {brief.roomDynamics.unresolvedIssues.length > 0 ? (
              <BriefList
                label="Still unresolved"
                items={brief.roomDynamics.unresolvedIssues}
                className="mt-0"
              />
            ) : null}
            {brief.roomDynamics.knownDisagreements.length > 0 ? (
              <BriefList
                label="Known disagreements"
                items={brief.roomDynamics.knownDisagreements}
                className="mt-0"
              />
            ) : null}
          </div>
        </BriefSection>
      ) : null}

      <ListeningSection cues={cues} level="supporting" />

      {brief.emphasize.length > 0 || brief.avoid.length > 0 ? (
        <section className="mt-9 grid gap-8 sm:grid-cols-2">
          {brief.emphasize.length > 0 ? (
            <div>
              <h2 className="label">Emphasize</h2>
              <BriefList items={brief.emphasize} accent className="mt-2.5" level={3} />
            </div>
          ) : null}
          {brief.avoid.length > 0 ? (
            <div>
              <h2 className="label">Avoid</h2>
              <BriefList items={brief.avoid} className="mt-2.5" level={3} />
            </div>
          ) : null}
        </section>
      ) : null}

      {brief.likelyObjections.length > 0 ? (
        <BriefSection level="supporting" title="Likely objections">
          <div className="mt-4 grid gap-4">
            {brief.likelyObjections.map((objection, i) => (
              <Panel key={i} className="p-5">
                <h3 className="text-ink text-sm font-medium">{objection.objection}</h3>
                <p className="text-ink-secondary mt-2 text-sm leading-relaxed">
                  {objection.response}
                </p>
                {objection.basis ? (
                  <p className="text-ink-muted mt-2.5 text-xs leading-relaxed">
                    {objection.basis}
                  </p>
                ) : null}
              </Panel>
            ))}
          </div>
        </BriefSection>
      ) : null}

      {brief.questionsYouMayGet.length > 0 ? (
        <BriefSection
          level="supporting"
          title="Questions you may get"
          icon={<MessageCircleQuestion className="text-accent size-3" aria-hidden="true" />}
        >
          <dl className="mt-4 grid gap-4">
            {brief.questionsYouMayGet.map((item, i) => (
              <div key={i}>
                <dt className="text-ink text-sm font-medium">{item.question}</dt>
                <dd className="text-ink-secondary mt-1 text-sm leading-relaxed">{item.response}</dd>
              </div>
            ))}
          </dl>
        </BriefSection>
      ) : null}

      {brief.questionsToAsk.length > 0 ? (
        <BriefSection level="supporting" title="Questions you should ask">
          <BriefList items={brief.questionsToAsk} className="mt-2.5" level={3} />
        </BriefSection>
      ) : null}

      {brief.checklist.length > 0 ? (
        <BriefSection
          level="supporting"
          title="Before you walk in"
          icon={<ClipboardCheck className="text-accent size-3" aria-hidden="true" />}
        >
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
        </BriefSection>
      ) : null}

      <ApertureRule className="mt-12" />

      {/* --- outside the ladder: deliberately prominent ----------------------- */}
      {brief.uncertainties.length > 0 ? (
        <section className="border-caution/25 bg-caution-wash mt-9 rounded-[var(--radius-lg)] border p-5 sm:p-6">
          <h2 className="label text-caution flex items-center gap-1.5">
            <CircleHelp className="size-3" aria-hidden="true" />
            What {brand.name} doesn&rsquo;t know
          </h2>
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

      {/* --- REFERENCE: where it came from ------------------------------------ */}
      <BriefSection level="reference" title={`Why ${brand.name} is recommending this`}>
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
      </BriefSection>

      <p className="text-ink-faint mt-8 text-xs">
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
