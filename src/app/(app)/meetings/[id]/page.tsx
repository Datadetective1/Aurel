import { redirect } from 'next/navigation'

/**
 * A meeting has no separate detail surface: the brief IS the meeting page.
 * Anything a user wants to do with a meeting starts from the brief.
 *
 * Query is forwarded rather than dropped. Saving a debrief redirects here with
 * `?debriefed=1`, and this hop was swallowing it — so the one moment the
 * product had something worth confirming arrived silently.
 */
export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value)
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  redirect(`/meetings/${id}/brief${suffix}`)
}
