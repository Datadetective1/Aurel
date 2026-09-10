import { redirect } from 'next/navigation'

/**
 * DEBRIEF
 * =============================================================================
 * The debrief is a conversation now. It always was one -- it wrote an
 * interaction row and ran extraction -- but its result was never shown
 * anywhere, and a conversation that did not come from a meeting had no way in
 * at all. The capture page takes a meeting id and pre-fills the room from its
 * attendees, so the old link lands in the same place with the same context.
 *
 * Kept as a route so bookmarks, the command palette and the meeting page all
 * keep working.
 * =============================================================================
 */
export default async function DebriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/conversations/new?meeting=${encodeURIComponent(id)}`)
}
