'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { addMeetingParticipant } from '@/app/(app)/meetings/actions'
import { Button } from '@/components/ui/button'

/**
 * ADD PARTICIPANTS
 * =============================================================================
 * Attach somebody the calendar did not know about.
 *
 * This replaces a link that went nowhere. The brief told the user nobody was in
 * the room yet and offered "Add participants", pointing at /meetings/[id] --
 * which is not a page, it redirects straight back to the brief. So the one
 * screen that asked for participants was the one screen that could not accept
 * them, and a meeting created from a calendar event had no other surface.
 *
 * Deliberately the smallest thing that makes the offer true: pick a person you
 * already track, attach them. No roles, no reordering, no removal — those
 * belong to a participant manager nobody has asked for. Calendar-synced
 * attendees keep arriving the way they always did; this is only for the person
 * the invite missed.
 * =============================================================================
 */

export interface PersonChoice {
  id: string
  name: string
  subtitle: string | null
}

export function AddParticipants({
  meetingId,
  people,
}: {
  meetingId: string
  people: PersonChoice[]
}) {
  const router = useRouter()
  const [personId, setPersonId] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function add() {
    if (!personId) return
    setPending(true)
    setError(null)
    const result = await addMeetingParticipant(meetingId, personId)
    setPending(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    setPersonId('')
    router.refresh()
  }

  // Nobody left to add is not an error state — it just means the answer is to
  // record someone new first.
  if (people.length === 0) {
    return (
      <p className="text-ink-muted flex flex-wrap items-center gap-1.5 text-xs">
        <UserPlus className="size-3.5 shrink-0" aria-hidden="true" />
        Everyone you track is already in this meeting.
        <Link
          href="/people/new"
          className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          Add someone new
        </Link>
        .
      </p>
    )
  }

  return (
    <div className="grid gap-2">
      {/* `min-w-0` is load-bearing and was missing.

          A <select>'s intrinsic width comes from its longest <option>, and
          these options are "Name — Job Title · Organisation". At 77 characters
          that is ~412px. This row is a GRID ITEM, and a grid item defaults to
          min-width:auto, which resolves to its min-content -- so the row
          refused to shrink below 470px and both grid items stretched to that
          track, taking the whole page sideways on a phone.

          `min-w-0` on the <select> was already there and does not help: it
          governs the select during FLEX layout, not the select's contribution
          to this row's own min-content. The constraint that has to be released
          is the grid item's automatic minimum, which is this element.

          Measured on the unprepared brief at 375px: document scrollWidth 515
          before, 375 after. */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label htmlFor="add-participant" className="sr-only">
          Add someone to this meeting
        </label>
        <select
          id="add-participant"
          value={personId}
          onChange={(event) => setPersonId(event.target.value)}
          className="border-line bg-surface text-ink min-w-0 flex-1 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-xs"
        >
          <option value="">Add someone to this meeting…</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.subtitle ? `${person.name} — ${person.subtitle}` : person.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={add}
          disabled={pending || personId === ''}
        >
          {pending ? 'Adding…' : 'Add'}
        </Button>
      </div>

      <p className="text-ink-faint text-[0.6875rem]">
        Not on the list?{' '}
        <Link
          href="/people/new"
          className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          Record them first
        </Link>
        .
      </p>

      {error ? <p className="text-caution text-xs">{error}</p> : null}
    </div>
  )
}
