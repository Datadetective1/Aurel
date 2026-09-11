'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CircleAlert, FileText, Loader2, Mic, Paperclip, PenLine, Upload } from 'lucide-react'
import { createConversation, type ConversationState } from '@/app/(app)/conversations/actions'
import { Button } from '@/components/ui/button'
import { FormField, Input, Select, Textarea } from '@/components/ui/field'
import { Eyebrow } from '@/components/ui/primitives'
import { VoiceRecorder } from './voice-recorder'
import { AddSomeoneButton, ParticipantPicker, PersonChip } from './participant-picker'
import { unknownSpeakers } from '@/lib/conversations/speakers'
import { localNow } from './interaction-form'
import { useHasMounted } from '@/lib/use-has-mounted'
import { cn } from '@/lib/utils'

/**
 * CAPTURE A CONVERSATION
 * =============================================================================
 * Four ways in, one form out. Speak it, record it, paste it, or upload it --
 * every path ends with words in the same textarea, which the user can still
 * read and edit before they press the one button. Nothing is analysed until
 * then.
 *
 * Participants are faces to tap, not a dropdown. The people in the room are
 * the most important fact about a conversation, and picking them should feel
 * like pointing at them.
 * =============================================================================
 */

export interface CapturePerson {
  id: string
  name: string
  fullName: string
  preferredName: string | null
  src: string | null
  subtitle: string | null
}

export interface CaptureMeeting {
  id: string
  title: string
  /** "Tomorrow", "3 days ago" -- reckoned on the server in the user's zone. */
  when: string | null
  attendeeIds: string[]
}

type Mode = 'notes' | 'voice' | 'record' | 'paste' | 'upload'

const MODES: { id: Mode; label: string; icon: typeof Mic; hint: string }[] = [
  { id: 'voice', label: 'Speak', icon: Mic, hint: 'A voice note about it, afterwards.' },
  { id: 'record', label: 'Record', icon: Mic, hint: 'The conversation itself, as it happens.' },
  { id: 'notes', label: 'Type', icon: PenLine, hint: 'Rough notes from memory.' },
  { id: 'paste', label: 'Paste', icon: FileText, hint: 'A transcript from a meeting tool.' },
  {
    id: 'upload',
    label: 'Upload',
    icon: Upload,
    hint: 'A transcript file: .vtt, .srt, .txt, .docx, .pdf.',
  },
]

const KINDS = [
  { value: 'meeting', label: 'A meeting' },
  { value: 'call', label: 'A call' },
  { value: 'informal', label: 'Something informal' },
  { value: 'message', label: 'Messages or chat' },
  { value: 'email', label: 'An email exchange' },
  { value: 'other', label: 'Something else' },
] as const

export function ConversationCapture({
  people,
  meetings,
  initialPersonIds = [],
  initialMeetingId = null,
  initialMode = 'voice',
  userNames = [],
  className,
}: {
  people: CapturePerson[]
  meetings: CaptureMeeting[]
  initialPersonIds?: string[]
  initialMeetingId?: string | null
  initialMode?: Mode
  /** The account holder's names, so their own lines are never suggested as a new person. */
  userNames?: (string | null | undefined)[]
  className?: string
}) {
  const [state, formAction] = useActionState<ConversationState, FormData>(createConversation, {})
  const [mode, setMode] = React.useState<Mode>(initialMode)
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(initialPersonIds))
  // People who were there but are not on record yet. Created on submit, by
  // name only, and attached with everything extracted under their label.
  const [newNames, setNewNames] = React.useState<string[]>([])
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [sourceText, setSourceText] = React.useState('')
  const [dismissedSpeakers, setDismissedSpeakers] = React.useState<Set<string>>(() => new Set())
  const [meetingId, setMeetingId] = React.useState(initialMeetingId ?? '')
  const [sourceKind, setSourceKind] = React.useState<string>(
    initialMode === 'paste' ? 'pasted_transcript' : 'typed_notes',
  )
  const [durationSeconds, setDurationSeconds] = React.useState<number | null>(null)
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [wentWell, setWentWell] = React.useState<number | null>(null)
  const sourceRef = React.useRef<HTMLTextAreaElement | null>(null)

  const mounted = useHasMounted()
  const defaultWhen = mounted ? localNow() : ''

  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0] ?? null

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const addNewName = (name: string) => {
    const trimmed = name.trim()
    if (trimmed.length < 2) return
    setNewNames((prev) =>
      prev.some((n) => n.toLowerCase() === trimmed.toLowerCase()) ? prev : [...prev, trimmed],
    )
    setPickerOpen(false)
  }
  const pickExisting = (id: string) => {
    setSelected((prev) => new Set(prev).add(id))
    setPickerOpen(false)
  }

  const chooseMeeting = (id: string) => {
    setMeetingId(id)
    const meeting = meetings.find((m) => m.id === id)
    if (meeting && meeting.attendeeIds.length > 0) setSelected(new Set(meeting.attendeeIds))
  }

  const chooseMode = (next: Mode) => {
    setMode(next)
    if (next === 'paste') setSourceKind('pasted_transcript')
    else if (next === 'notes') setSourceKind('typed_notes')
    // voice, record and upload set their kind when the words arrive
  }

  function insertTranscript(text: string, seconds: number, origin: 'recorded' | 'file') {
    const field = sourceRef.current
    if (!field) return
    const existing = field.value.trimEnd()
    field.value = existing.length > 0 ? `${existing}\n\n${text}` : text
    field.dispatchEvent(new Event('input', { bubbles: true }))
    setSourceText(field.value)
    if (seconds > 0) setDurationSeconds(seconds)
    setSourceKind(
      mode === 'voice' && origin === 'recorded'
        ? 'voice_note'
        : origin === 'file'
          ? 'uploaded_audio'
          : 'meeting_recording',
    )
    field.focus()
    field.setSelectionRange(field.value.length, field.value.length)
  }

  const isRecordingOfOthers = sourceKind === 'meeting_recording' || sourceKind === 'uploaded_audio'
  const selectedPeople = people.filter((p) => selected.has(p.id))

  // Speakers the words name who are neither the user nor already chosen.
  // A suggestion, never an action: nothing is created until a button says so.
  const known = people.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    preferredName: p.preferredName,
  }))
  const chosen = [
    ...known.filter((p) => selected.has(p.id)),
    ...newNames.map((n) => ({ id: `new:${n}`, fullName: n, preferredName: null })),
  ]
  const speakerSuggestions = unknownSpeakers(sourceText, {
    userNames,
    participants: chosen,
    people: known,
  }).filter((s) => !dismissedSpeakers.has(s.label))

  return (
    <form action={formAction} noValidate className={cn('grid min-w-0 gap-8', className)}>
      <input type="hidden" name="sourceKind" value={sourceKind} />
      <input type="hidden" name="meetingId" value={meetingId} />
      {durationSeconds !== null ? (
        <input type="hidden" name="durationSeconds" value={durationSeconds} />
      ) : null}
      {wentWell ? <input type="hidden" name="wentWell" value={wentWell} /> : null}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="participant" value={id} />
      ))}
      {newNames.map((name) => (
        <input key={name} type="hidden" name="newParticipant" value={name} />
      ))}

      {/* --- how ------------------------------------------------------------------ */}
      <section className="min-w-0">
        <Eyebrow>How did you keep it?</Eyebrow>
        <div
          role="tablist"
          aria-label="How to add the conversation"
          className="border-line bg-bg-sunken mt-3 flex scrollbar-none gap-1 overflow-x-auto rounded-[var(--radius-md)] border p-1"
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => chooseMode(m.id)}
              className={cn(
                'flex min-h-10 shrink-0 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                mode === m.id ? 'bg-surface text-ink' : 'text-ink-secondary hover:text-ink',
              )}
            >
              <m.icon
                className={cn('size-3.5', mode === m.id ? 'text-accent' : 'text-ink-faint')}
                aria-hidden="true"
              />
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-ink-muted mt-2 text-xs">{MODES.find((m) => m.id === mode)?.hint}</p>

        <div className="mt-4">
          {mode === 'voice' ? (
            <VoiceRecorder
              mode="note"
              participantIds={[...selected]}
              onTranscript={insertTranscript}
            />
          ) : null}
          {mode === 'record' ? (
            <VoiceRecorder
              mode="live"
              participantIds={[...selected]}
              onTranscript={insertTranscript}
            />
          ) : null}
          {mode === 'upload' ? (
            <div className="border-line bg-bg-sunken rounded-[var(--radius-md)] border px-4 py-3">
              <label className="text-ink-secondary flex cursor-pointer flex-wrap items-center gap-3 text-sm">
                <Paperclip className="text-ink-faint size-4" aria-hidden="true" />
                <span className="border-line-strong bg-surface text-ink rounded-[var(--radius-sm)] border px-3 py-2 text-xs font-medium">
                  {fileName ? 'Choose a different file' : 'Choose a transcript file'}
                </span>
                {fileName ? <span className="text-ink-muted text-xs">{fileName}</span> : null}
                <input
                  type="file"
                  name="transcriptFile"
                  accept=".vtt,.srt,.txt,.md,.docx,.pdf"
                  className="sr-only"
                  onChange={(e) => {
                    setFileName(e.currentTarget.files?.[0]?.name ?? null)
                    setSourceKind('uploaded_transcript')
                  }}
                />
              </label>
              {fieldError('transcriptFile') ? (
                <p role="alert" className="text-critical mt-2 text-xs">
                  {fieldError('transcriptFile')}
                </p>
              ) : null}
              <p className="text-ink-muted mt-2 text-xs leading-relaxed">
                Captions from Zoom, Teams, Meet or Otter work. Timestamps are stripped; speaker
                names are kept so promises land on the right person.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* --- the words ------------------------------------------------------------- */}
      <FormField
        id="source"
        label={
          mode === 'paste'
            ? 'The transcript'
            : mode === 'upload'
              ? 'Anything to add'
              : mode === 'notes'
                ? 'What happened?'
                : 'The words'
        }
        description={
          mode === 'upload'
            ? 'Optional. Context the file does not carry, such as who was there and what you were hoping for.'
            : mode === 'notes'
              ? 'Rough notes are fine. Names help: they are how each promise gets attached to the right person.'
              : 'Read it over before you continue. You can fix names or cut anything that should not be kept.'
        }
        error={fieldError('source')}
      >
        {(props) => (
          <Textarea
            {...props}
            ref={sourceRef}
            name="source"
            rows={mode === 'paste' ? 14 : 9}
            maxLength={400_000}
            onChange={(e) => setSourceText(e.currentTarget.value)}
            placeholder={
              mode === 'paste'
                ? 'Ravi: I can get you the revised numbers by Thursday.\nYou: Great — and we agreed the launch moves to March?\nRavi: Yes, March.'
                : 'Ravi asked for the cost impact before the recommendation. I said I would send the revised forecast by Thursday. We agreed the launch moves to March. Still unclear who owns the migration budget.'
            }
            className="leading-relaxed"
          />
        )}
      </FormField>

      {/* --- who ------------------------------------------------------------------- */}
      <section className="min-w-0">
        <Eyebrow>Who was in it?</Eyebrow>
        <p className="text-ink-muted mt-1.5 text-xs">
          {people.length === 0
            ? 'Nobody on record yet. Add whoever was there by name; the rest can wait.'
            : 'Tap the people who were there, or add someone new. Promises get attached to them.'}
        </p>

        <ul className="mt-3 flex flex-wrap gap-2">
          {people.map((p) => (
            <li key={p.id}>
              <PersonChip person={p} pressed={selected.has(p.id)} onClick={() => toggle(p.id)} />
            </li>
          ))}
          {newNames.map((name) => (
            <li key={name}>
              <PersonChip
                person={{
                  id: `new:${name}`,
                  fullName: name,
                  preferredName: null,
                  subtitle: 'New person',
                }}
                pressed
                onRemove={() => setNewNames((prev) => prev.filter((n) => n !== name))}
              />
            </li>
          ))}
          <li>
            {!pickerOpen ? (
              <AddSomeoneButton
                className="min-h-11"
                label={people.length === 0 ? 'Add someone by name' : 'Add someone'}
                onClick={() => setPickerOpen(true)}
              />
            ) : null}
          </li>
        </ul>

        {pickerOpen ? (
          <ParticipantPicker
            className="mt-3 max-w-md"
            people={people}
            excludeIds={[...selected]}
            onPickExisting={(p) => pickExisting(p.id)}
            onCreate={addNewName}
            onCancel={() => setPickerOpen(false)}
          />
        ) : null}

        {speakerSuggestions.length > 0 ? (
          <div className="border-accent/25 bg-accent-wash mt-3 rounded-[var(--radius-md)] border p-4">
            <p className="text-ink text-sm">
              {speakerSuggestions.length === 1
                ? `${speakerSuggestions[0]!.label} appears in this conversation.`
                : `${speakerSuggestions.map((s) => s.label).join(', ')} appear in this conversation.`}{' '}
              <span className="text-ink-muted">Add or link them?</span>
            </p>
            <ul className="mt-2.5 grid gap-2">
              {speakerSuggestions.map((s) => {
                const matched = s.match
                const probable =
                  matched.kind === 'none' ? null : people.find((p) => p.id === matched.person.id)
                return (
                  <li key={s.label} className="flex flex-wrap items-center gap-2">
                    {probable ? (
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-10"
                        onClick={() => pickExisting(probable.id)}
                      >
                        {s.label} is {probable.name}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant={probable ? 'secondary' : 'primary'}
                      className="min-h-10"
                      onClick={() => addNewName(s.label)}
                    >
                      Add {s.label} as a new person
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="quiet"
                      className="min-h-10"
                      onClick={() => setDismissedSpeakers((prev) => new Set(prev).add(s.label))}
                    >
                      Not a person
                    </Button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </section>

      {/* --- details ----------------------------------------------------------------- */}
      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          id="title"
          label="Title"
          description="Optional. Without one, the meeting's name or the date is used."
          error={fieldError('title')}
        >
          {(props) => (
            <Input {...props} name="title" placeholder="Budget sync with Ravi" maxLength={200} />
          )}
        </FormField>

        <FormField id="occurredAt" label="When" required error={fieldError('occurredAt')}>
          {(props) => (
            <Input {...props} type="datetime-local" name="occurredAt" defaultValue={defaultWhen} />
          )}
        </FormField>

        <FormField id="kind" label="What kind">
          {(props) => (
            <Select {...props} name="kind" defaultValue="meeting">
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        {meetings.length > 0 ? (
          <FormField
            id="meeting"
            label="Part of a meeting?"
            description="Links the conversation to the brief you prepared with."
          >
            {(props) => (
              <Select
                {...props}
                value={meetingId}
                onChange={(e) => chooseMeeting(e.currentTarget.value)}
              >
                <option value="">Not linked</option>
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                    {m.when ? ` · ${m.when}` : ''}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        ) : null}
      </div>

      {/* --- how it went ------------------------------------------------------------ */}
      <fieldset>
        <legend className="text-ink text-sm font-medium">How did it go?</legend>
        <p className="text-ink-muted mt-1 text-xs">
          Optional. Your read, not a score of anyone else.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            [1, 'Badly'],
            [2, 'Not great'],
            [3, 'Fine'],
            [4, 'Well'],
            [5, 'Very well'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setWentWell(wentWell === value ? null : (value as number))}
              aria-pressed={wentWell === value}
              className={cn(
                'min-h-11 rounded-[var(--radius-md)] border px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                wentWell === value
                  ? 'border-accent bg-accent text-accent-contrast'
                  : 'border-line-strong text-ink-secondary hover:border-ink-faint hover:bg-bg-sunken',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* --- consent ------------------------------------------------------------------ */}
      {isRecordingOfOthers ? (
        <label className="border-line bg-bg-sunken text-ink-secondary flex items-start gap-3 rounded-[var(--radius-md)] border p-4 text-sm leading-relaxed">
          <input
            type="checkbox"
            name="consent"
            value="yes"
            className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
          />
          <span>
            {selectedPeople.length > 0
              ? `${selectedPeople.map((p) => p.name.split(' ')[0]).join(', ')} knew this was being recorded.`
              : 'The people in this recording knew it was being recorded.'}
            <span className="text-ink-muted mt-1 block text-xs">
              Recording rules differ by place. This is your confirmation, kept with the
              conversation.
            </span>
          </span>
        </label>
      ) : null}
      {fieldError('consent') ? (
        <p role="alert" className="text-critical -mt-5 text-xs">
          {fieldError('consent')}
        </p>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="border-critical/25 bg-critical-wash text-critical flex items-start gap-2 rounded-[var(--radius-md)] border px-3.5 py-3 text-xs leading-relaxed"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      <Submit />
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Reading it…
          </>
        ) : (
          'Keep this conversation'
        )}
      </Button>
      <p className="text-ink-muted mt-3 text-xs leading-relaxed">
        {pending
          ? 'Pulling out what was promised, what was decided and what was left open. Nothing is added to your record until you review it.'
          : 'Next: a page showing what it left open, for you to confirm or correct.'}
      </p>
    </div>
  )
}
