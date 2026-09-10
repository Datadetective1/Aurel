import { redirect } from 'next/navigation'

/**
 * LOG AN INTERACTION
 * =============================================================================
 * Now the conversation capture page, pre-filled with this person and opened
 * on the typing tab, because that is what "log an interaction" was: a few
 * lines from memory, attached to somebody. The difference is that those lines
 * are now read for what they left open, and the result is shown.
 *
 * Kept as a route because the person page linked here for a long time.
 * =============================================================================
 */
export default async function LogInteractionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/conversations/new?person=${encodeURIComponent(id)}&mode=notes`)
}
