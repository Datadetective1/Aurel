import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { DebriefForm } from '@/components/app/debrief-form'
import { Button } from '@/components/ui/button'
import { Container, Eyebrow } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { brand } from '@/lib/brand'

export const metadata: Metadata = { title: 'Debrief', robots: { index: false, follow: false } }

export default async function DebriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, objective, status')
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()

  if (!meeting) notFound()

  const { data: attendees } = await supabase
    .from('meeting_attendees')
    .select('people(full_name, preferred_name)')
    .eq('user_id', user.id)
    .eq('meeting_id', id)

  const names = (attendees ?? [])
    .map((a) => a.people?.preferred_name || a.people?.full_name)
    .filter((n): n is string => Boolean(n))

  return (
    <Container size="narrow" className="py-8 sm:py-12">
      <Button asChild variant="quiet" size="sm" className="-ml-3">
        <Link href={`/meetings/${id}/brief`}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to brief
        </Link>
      </Button>

      <header className="mt-4">
        <Eyebrow>After the meeting</Eyebrow>
        <h1 className="mt-3 font-display text-3xl text-ink sm:text-4xl">{meeting.title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-secondary">
          Write what happened, or paste a transcript. {brand.name} will pull out the decisions,
          commitments and objections — and propose what is worth remembering about each person.
          Nothing enters your relationship record until you approve it.
        </p>
      </header>

      {meeting.objective ? (
        <div className="mt-6 rounded-[var(--radius-md)] border border-line bg-bg-sunken px-4 py-3">
          <Eyebrow>What you set out to do</Eyebrow>
          <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{meeting.objective}</p>
        </div>
      ) : null}

      <div className="mt-8">
        <DebriefForm meetingId={id} participantNames={names} />
      </div>
    </Container>
  )
}
