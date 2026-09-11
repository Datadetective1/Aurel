import Link from 'next/link'
import type { Metadata } from 'next'
import { Search, UserPlus } from 'lucide-react'
import { IllustratedEmpty } from '@/components/app/empty-visual'
import { PeopleCards, type PersonCardData } from '@/components/app/people-cards'
import { Button } from '@/components/ui/button'
import { Container, Eyebrow, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { relativeDay, pluralise } from '@/lib/format'
import { resolveFaces } from '@/lib/conversations/avatars'
import { brand } from '@/lib/brand'
import { findDuplicates } from './actions'
import { DuplicateReview } from '@/components/app/duplicate-review'

export const metadata: Metadata = { title: 'People', robots: { index: false, follow: false } }

const RELATIONSHIP_LABEL: Record<string, string> = {
  manager: 'Manager',
  report: 'Report',
  skip_level: 'Skip-level',
  peer: 'Peer',
  cross_functional: 'Cross-functional',
  customer: 'Customer',
  prospect: 'Prospect',
  vendor: 'Vendor',
  partner: 'Partner',
  candidate: 'Candidate',
  mentor: 'Mentor',
  external: 'External',
  other: 'Other',
}

export default async function PeoplePage() {
  const { user, profile } = await requireOnboardedUser()
  const timeZone = profile.timezone ?? 'UTC'
  const now = new Date()

  const supabase = await createClient()

  const { data: people } = await supabase
    .from('people')
    .select(
      'id, full_name, preferred_name, job_title, relationship_type, relevance, last_interaction_at, last_researched_at, avatar_url, avatar_path, is_demo, organizations(name)',
    )
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('relevance', { ascending: false })
    .order('last_interaction_at', { ascending: false, nullsFirst: false })
    .limit(200)

  const list = people ?? []
  const ids = list.map((p) => p.id)
  const faces = await resolveFaces(supabase, list, (p) => p.id)

  // Counts that make the list scannable: what does Atturel actually know?
  const [{ data: observations }, { data: commitments }, { data: nextMeetings }] = await Promise.all(
    [
      ids.length
        ? supabase
            .from('observations')
            .select('person_id, status')
            .eq('user_id', user.id)
            .in('person_id', ids)
        : Promise.resolve({ data: [] as { person_id: string; status: string }[] }),
      ids.length
        ? supabase
            .from('commitments')
            .select('person_id')
            .eq('user_id', user.id)
            .eq('status', 'open')
            .eq('review_status', 'confirmed')
            .in('person_id', ids)
        : Promise.resolve({ data: [] as { person_id: string | null }[] }),
      // The next time you will see each of them, if a meeting is on the books.
      ids.length
        ? supabase
            .from('meeting_attendees')
            .select('person_id, meetings!inner(scheduled_at, status)')
            .eq('user_id', user.id)
            .eq('meetings.status', 'upcoming')
            .gte('meetings.scheduled_at', now.toISOString())
            .in('person_id', ids)
        : Promise.resolve({
            data: [] as { person_id: string; meetings: { scheduled_at: string | null } | null }[],
          }),
    ],
  )

  const nextByPerson = new Map<string, string>()
  for (const row of nextMeetings ?? []) {
    const at = row.meetings?.scheduled_at
    if (!at) continue
    const current = nextByPerson.get(row.person_id)
    if (!current || at < current) nextByPerson.set(row.person_id, at)
  }

  const activeByPerson = new Map<string, number>()
  const proposedByPerson = new Map<string, number>()
  for (const o of observations ?? []) {
    const map =
      o.status === 'active' ? activeByPerson : o.status === 'proposed' ? proposedByPerson : null
    if (map) map.set(o.person_id, (map.get(o.person_id) ?? 0) + 1)
  }

  const openByPerson = new Map<string, number>()
  for (const c of commitments ?? []) {
    if (c.person_id) openByPerson.set(c.person_id, (openByPerson.get(c.person_id) ?? 0) + 1)
  }

  // Only worth computing once there is enough to collide.
  const duplicates = list.length > 1 ? await findDuplicates() : []

  const cards: PersonCardData[] = list.map((person) => {
    const next = nextByPerson.get(person.id)
    return {
      id: person.id,
      name: person.preferred_name || person.full_name,
      fullName: person.full_name,
      src: faces.get(person.id) ?? null,
      title: person.job_title,
      company: person.organizations?.name ?? null,
      relationship: RELATIONSHIP_LABEL[person.relationship_type] ?? 'Other',
      lastSpokeLabel: person.last_interaction_at
        ? relativeDay(person.last_interaction_at, timeZone, now).toLowerCase()
        : null,
      nextLabel: next ? `Next ${relativeDay(next, timeZone, now).toLowerCase()}` : null,
      openLoops: openByPerson.get(person.id) ?? 0,
      toReview: proposedByPerson.get(person.id) ?? 0,
      learned: activeByPerson.get(person.id) ?? 0,
      isDemo: person.is_demo,
    }
  })

  return (
    <Container size="default" className="py-8 sm:py-12">
      <SectionHeader
        as="h1"
        eyebrow="Relationships"
        title="People"
        description={
          list.length > 0
            ? `${pluralise(list.length, 'person', 'people')} in your relationship record.`
            : undefined
        }
        action={
          <Button asChild>
            <Link href="/people/new">
              <UserPlus className="size-4" aria-hidden="true" />
              Add a person
            </Link>
          </Button>
        }
      />

      {duplicates.length > 0 ? (
        <div className="mt-8">
          <DuplicateReview pairs={duplicates} />
        </div>
      ) : null}

      {list.length === 0 ? (
        <IllustratedEmpty
          className="mt-10"
          subject="people"
          tone="wash"
          title="Start with someone you work with often"
          // The old copy said research was something you could do; it did not
          // say Atturel does it for you, from three fields, which is the part
          // that changes whether somebody bothers.
          description={`A name, a company and a role is all ${brand.name} needs. It searches legitimate public professional sources — company bios, talks, interviews, articles — checks each one is genuinely about that person, and builds a record you can see the evidence behind. Add what you already know as well.`}
          action={
            <Button asChild>
              <Link href="/people/new">Add your first person</Link>
            </Button>
          }
        />
      ) : (
        <PeopleCards people={cards} className="mt-8" />
      )}

      {list.length > 8 ? (
        <p className="text-ink-muted mt-6 flex items-center gap-2 text-xs">
          <Search className="size-3.5" aria-hidden="true" />
          Press <kbd className="border-line rounded border px-1.5 py-0.5 font-sans">⌘K</kbd> to jump
          to anyone.
        </p>
      ) : null}

      <Eyebrow className="mt-12 block">A note on what this is</Eyebrow>
      <p className="text-ink-muted mt-3 max-w-xl text-xs leading-relaxed">
        This is your private working record of the people you interact with professionally. It is
        visible only to you, it focuses on professional context, and you can delete any person, any
        observation or the whole record at any time.
      </p>
    </Container>
  )
}
