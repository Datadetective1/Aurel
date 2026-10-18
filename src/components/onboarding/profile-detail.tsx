import { Fingerprint } from '@/components/onboarding/fingerprint'
import { Eyebrow } from '@/components/ui/primitives'
import type { ProfileNarrative } from '@/lib/ai/prompts/coaching'
import type { FirstRead } from '@/lib/assessment/first-read'

type FingerprintDimensions = React.ComponentProps<typeof Fingerprint>['dimensions']

/**
 * THE FULL PROFILE
 * =============================================================================
 * The eight-dimension fingerprint and the written narrative, as the reveal
 * used to show them at the end of setup. Kept intact; moved to Settings,
 * where somebody curious goes looking for it.
 *
 * When there is no narrative yet -- it is written in the background after
 * scoring -- the composed first read stands in, labelled as such. Never an
 * error: the scores are complete either way.
 * =============================================================================
 */
export function ProfileDetail({
  dimensions,
  contextDependent,
  narrative,
  read,
}: {
  dimensions: FingerprintDimensions
  contextDependent: Set<string>
  narrative: ProfileNarrative | null
  read: FirstRead | null
}) {
  return (
    <div className="grid gap-10">
      <section>
        <Eyebrow>Your communication fingerprint</Eyebrow>
        <p className="text-ink-secondary mt-3 max-w-xl text-sm leading-relaxed">
          Each tendency sits on a continuum. Neither end is better — the point is knowing your
          default so you can tell when a situation calls for something else.
        </p>
        <Fingerprint dimensions={dimensions} contextDependent={contextDependent} className="mt-8" />
      </section>

      {narrative ? (
        <div className="grid gap-10">
          {narrative.summary ? (
            <p className="text-ink-secondary max-w-2xl text-base leading-relaxed">
              {narrative.summary}
            </p>
          ) : null}
          <NarrativeSection
            eyebrow="Your natural default"
            description="How you tend to communicate, decide and collaborate when nothing forces you to adapt."
            items={narrative.naturalDefault}
          />
          <div className="grid gap-10 sm:grid-cols-2">
            <NarrativeSection eyebrow="At your best" items={narrative.atYourBest} />
            <NarrativeSection
              eyebrow="Under pressure"
              items={narrative.underPressure}
              description="The same tendencies, stretched."
            />
          </div>
          <div className="grid gap-10 sm:grid-cols-2">
            <NarrativeSection
              eyebrow="People may experience you as"
              items={narrative.howOthersExperienceYou}
            />
            <NarrativeSection eyebrow="You work best when" items={narrative.youWorkBestWhen} />
          </div>
        </div>
      ) : read ? (
        <section>
          <Eyebrow>What your answers say</Eyebrow>
          <p className="text-ink-secondary mt-3 max-w-xl text-sm leading-relaxed">
            {read.explanation}
          </p>
          <p className="text-ink-muted mt-2 text-xs">
            A longer written summary appears here once it has been composed.
          </p>
        </section>
      ) : null}
    </div>
  )
}

function NarrativeSection({
  eyebrow,
  description,
  items,
}: {
  eyebrow: string
  description?: string
  items: string[]
}) {
  if (items.length === 0) return null
  return (
    <section>
      <Eyebrow>{eyebrow}</Eyebrow>
      {description ? <p className="text-ink-muted mt-2 text-xs">{description}</p> : null}
      <ul className="mt-4 grid gap-3">
        {items.map((item) => (
          <li key={item} className="text-ink-secondary flex gap-3 text-sm leading-relaxed">
            <span aria-hidden="true" className="bg-accent-graphic mt-2 h-px w-3 shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}
