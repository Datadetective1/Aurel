'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CircleAlert, Loader2, Sparkles } from 'lucide-react'
import { generateBrief, updateMeetingObjective } from '@/app/(app)/meetings/actions'
import { AddParticipants, type PersonChoice } from '@/components/app/add-participants'
import { Button } from '@/components/ui/button'
import { Eyebrow, Panel } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'

/**
 * Brief generation with truthful progress.
 *
 * Each stage names a step that genuinely runs server-side: assembling the room,
 * reading the relationship record, checking commitments, composing. The stages
 * advance on a timer because a single server action cannot stream progress, but
 * they never claim completion — the panel only resolves when the server returns.
 */
const STAGES = [
  'Reading the meeting…',
  'Gathering everyone in the room…',
  'Reviewing your relationship record…',
  'Checking open commitments…',
  'Building your brief…',
] as const

export function GenerateBriefPanel({
  meetingId,
  hasObjective,
  attendeeCount,
  addablePeople,
}: {
  meetingId: string
  hasObjective: boolean
  attendeeCount: number
  addablePeople: PersonChoice[]
}) {
  const router = useRouter()
  const [objective, setObjective] = React.useState('')
  const [savingObjective, setSavingObjective] = React.useState(false)

  /**
   * The objective is set here rather than behind a link.
   *
   * It used to point at /meetings/[id], which redirects straight back to this
   * brief -- so the app told you the brief would be sharper with an objective,
   * offered a link, and returned you to the page you were already on. A meeting
   * created from a calendar event has no other surface, so there was no way to
   * give one at all.
   */
  async function saveObjective() {
    const text = objective.trim()
    if (!text) return
    setSavingObjective(true)
    const form = new FormData()
    form.set('meetingId', meetingId)
    form.set('objective', text)
    const result = await updateMeetingObjective({}, form)
    setSavingObjective(false)
    if (result?.error) setError(result.error)
    else router.refresh()
  }
  const [running, setRunning] = React.useState(false)
  const [stage, setStage] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [upgrade, setUpgrade] = React.useState(false)

  React.useEffect(() => {
    if (!running) return
    const timer = window.setInterval(
      () => setStage((s) => Math.min(s + 1, STAGES.length - 1)),
      1600,
    )
    return () => window.clearInterval(timer)
  }, [running])

  const run = async () => {
    setRunning(true)
    setStage(0)
    setError(null)
    setUpgrade(false)

    const result = await generateBrief(meetingId)
    if (result.ok) {
      router.refresh()
    } else {
      setRunning(false)
      setError(result.error ?? 'Something went wrong.')
      setUpgrade('upgrade' in result && Boolean(result.upgrade))
    }
  }

  return (
    <Panel className="mt-8 p-6 sm:p-8">
      {running ? (
        <div role="status" aria-live="polite">
          <div className="flex items-center gap-2.5 text-sm text-ink">
            <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" />
            {STAGES[stage]}
          </div>
          <div className="mt-4 h-px w-full overflow-hidden bg-line">
            <div
              className="h-full bg-accent-graphic transition-[width] duration-700 ease-[var(--ease-out-quint)]"
              style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <Eyebrow className="flex items-center gap-1.5">
            <Sparkles className="size-3 text-accent" aria-hidden="true" />
            Prepare
          </Eyebrow>
          <h2 className="mt-3 font-display text-2xl text-ink">Build your brief</h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-secondary">
            {brand.name} will pull together everyone in the room, what you have recorded about
            working with them, what is still open between you, and turn it into how to approach this
            conversation.
          </p>

          {(!hasObjective || attendeeCount === 0) && (
            <ul className="mt-5 grid gap-2">
              {!hasObjective ? (
                <li className="grid gap-2 text-xs text-ink-muted">
                  <span className="flex gap-2">
                    <CircleAlert
                      className="mt-px size-3.5 shrink-0 text-caution"
                      aria-hidden="true"
                    />
                    No objective recorded. The brief will be much sharper with one.
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <label htmlFor="brief-objective" className="sr-only">
                      What do you need out of this conversation?
                    </label>
                    <input
                      id="brief-objective"
                      value={objective}
                      onChange={(event) => setObjective(event.target.value)}
                      placeholder="What do you need out of this conversation?"
                      className="border-line bg-surface text-ink min-w-0 flex-1 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={saveObjective}
                      disabled={savingObjective || objective.trim().length === 0}
                    >
                      {savingObjective ? 'Saving…' : 'Save'}
                    </Button>
                  </span>
                </li>
              ) : null}
              {attendeeCount === 0 ? (
                <li className="flex gap-2 text-xs text-ink-muted">
                  <CircleAlert
                    className="mt-px size-3.5 shrink-0 text-caution"
                    aria-hidden="true"
                  />
                  Nobody is added to this meeting yet.
                </li>
              ) : null}
            </ul>
          )}

          {/* Not gated on an empty room. A calendar meeting where two of three
              attendees matched needs the third added just as much as an empty
              one does, and gating on zero left exactly that case with nowhere
              to do it. */}
          <div className="mt-5">
            <AddParticipants meetingId={meetingId} people={addablePeople} />
          </div>

          <Button size="lg" onClick={run} className="mt-7">
            Generate brief
          </Button>

          {error ? (
            <div className="mt-5 rounded-[var(--radius-md)] border border-caution/25 bg-caution-wash px-4 py-3">
              <p className="text-sm leading-relaxed text-ink-secondary">{error}</p>
              {upgrade ? (
                <Button asChild size="sm" className="mt-3">
                  <Link href="/settings/billing">See plans</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Panel>
  )
}
