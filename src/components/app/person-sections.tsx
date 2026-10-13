import { Handshake, History, Mic } from 'lucide-react'
import { AddLoop } from '@/components/app/add-loop'
import { LoopList } from '@/components/app/loop-list'
import { EvidenceLine } from '@/components/app/evidence'
import type { Provenance } from '@/components/app/provenance'
import { RelationshipTimeline } from '@/components/visual/timeline'
import { QuietEmpty } from '@/components/visual/quiet-empty'
import { Eyebrow } from '@/components/ui/primitives'
import type { LoopRecord } from '@/lib/conversations/queries'
import type { TimelineEntry } from '@/lib/visual/timeline'
import type { Database } from '@/lib/supabase/types'
import { pluralise } from '@/lib/format'

/**
 * The person page's two working columns -- what is open, and the dated
 * relationship memory -- as presentation over props, so the visual preview
 * renders exactly what the signed-in page renders.
 */
export function PersonRelationshipSections({
  personId,
  name,
  firstName,
  loops,
  closedCount,
  learned,
  interactionCount,
  timeline,
  timeZone,
  now,
}: {
  personId: string
  name: string
  firstName: string
  loops: LoopRecord[]
  closedCount: number
  learned: {
    category: string
    label: string
    items: {
      id: string
      content: string
      level: Database['public']['Enums']['evidence_level']
      provenance: Provenance
      reinforcementCount: number
    }[]
  }[]
  interactionCount: number
  timeline: TimelineEntry[]
  timeZone: string
  now: Date
}) {
  return (
    <>
      {/* --- open loops and the timeline, side by side on a desk ------------------ */}
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12">
        <section aria-labelledby="loops-heading" className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Eyebrow>Open loops</Eyebrow>
              <h2 id="loops-heading" className="font-display text-ink mt-2 text-xl">
                {loops.length === 0 ? 'Nothing open' : `${loops.length} open with ${firstName}`}
              </h2>
            </div>
            <AddLoop people={[{ id: personId, name }]} defaultPersonId={personId} />
          </div>
          {loops.length > 0 ? (
            <LoopList
              className="mt-5"
              loops={loops}
              timeZone={timeZone}
              now={now}
              showPerson={false}
            />
          ) : (
            <QuietEmpty
              className="mt-3"
              icon={Handshake}
              title="You're clear"
              body={`Nothing is owed either way with ${firstName}.`}
            />
          )}
          {closedCount > 0 ? (
            <p className="text-ink-muted mt-3 text-xs">
              {pluralise(closedCount, 'loop')} closed with {firstName}.
            </p>
          ) : null}

          {/* --- what you have learned, as short evidence lines -------------- */}
          {learned.length > 0 ? (
            <div className="mt-10">
              <Eyebrow>What you have learned</Eyebrow>
              <div className="mt-4 grid gap-6">
                {learned.map(({ category, label, items }) => (
                  <div key={category}>
                    <h3 className="text-ink text-sm font-medium">{label}</h3>
                    <ul className="mt-3 grid gap-3.5">
                      {items.map((o) => (
                        <EvidenceLine
                          key={o.id}
                          content={o.content}
                          level={o.level}
                          provenance={o.provenance}
                          reinforcementCount={o.reinforcementCount}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="timeline-heading" className="min-w-0">
          <Eyebrow>Relationship memory</Eyebrow>
          <h2 id="timeline-heading" className="font-display text-ink mt-2 text-xl">
            {interactionCount === 0
              ? 'No memory yet'
              : `${pluralise(interactionCount, 'conversation')} on record`}
          </h2>
          {timeline.length > 0 ? (
            <RelationshipTimeline className="mt-5" entries={timeline} timeZone={timeZone} />
          ) : (
            <QuietEmpty
              className="mt-3"
              icon={History}
              title={`Nothing kept with ${firstName} yet`}
              body="Your first captured conversation starts the record."
              action={{
                label: 'Capture',
                href: `/conversations/new?person=${personId}`,
                icon: Mic,
              }}
            />
          )}
        </section>
      </div>
    </>
  )
}
