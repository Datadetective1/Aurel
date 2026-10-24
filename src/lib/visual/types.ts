/**
 * Shapes the visual surfaces render from. Pure types, imported by the web
 * pages, the mobile API routes and the native app alike, so the contract
 * between them is one definition rather than three that drift.
 */

import type { ActionDirection } from './relationship-actions'
import type { PrepState, RememberItem } from './glance'
import type { Connection } from './commonality'
import type { TimelineEntry } from './timeline'

/** A person as the visual surfaces show them: a face, a place, a state. */
export interface VisualPerson {
  id: string
  /** Preferred name, for display. */
  name: string
  /** Full name, for initials and accessible labels. */
  fullName: string
  /** Signed photo URL, or null for the initials fallback. */
  src: string | null
  title: string | null
  company: string | null
  /** The organisation's domain on record, the only basis for a logo. */
  companyDomain: string | null
  /** "Decision maker", "Your manager" -- whatever places them. */
  context: string | null
  lastInteractionAt: string | null
  /** Confirmed, active loops with this person. */
  openLoops: number
  /** Of those, the ones the user owes. */
  owe: number
  /** Part of the fictional sample record. Shown as such wherever the person appears. */
  isDemo?: boolean
}

export interface VisualLoop {
  id: string
  description: string
  direction: ActionDirection
  dueOn: string | null
  overdue: boolean
  personId: string | null
  personName: string | null
  interactionId: string | null
}

export interface VisualMeetingSummary {
  id: string
  title: string
  scheduledAt: string | null
  objective: string | null
  prep: PrepState
  people: VisualPerson[]
  openLoops: number
  /** Part of the fictional sample record. */
  isDemo?: boolean
}

export interface VisualGlance {
  objective: string | null
  howToOpen: string | null
  remember: RememberItem[]
  /** The single open loop most worth naming: overdue first, then soonest. */
  openLoop: VisualLoop | null
}

export interface VisualConnection extends Connection {
  description: string
}

export interface VisualPersonDetail {
  person: VisualPerson & {
    relationshipLabel: string
    email: string | null
    nextMeeting: { id: string; title: string; scheduledAt: string | null } | null
  }
  loops: VisualLoop[]
  timeline: TimelineEntry[]
  /** Recent topics from kept conversations, most recent first, deduplicated. */
  themes: string[]
}
