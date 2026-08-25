import { redirect } from 'next/navigation'

/**
 * A meeting has no separate detail surface: the brief IS the meeting page.
 * Anything a user wants to do with a meeting starts from the brief.
 */
export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/meetings/${id}/brief`)
}
