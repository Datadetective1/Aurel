import Link from 'next/link'
import type { Metadata } from 'next'
import { Archive, ArrowLeft, Info, Search, UserPlus } from 'lucide-react'
import { IllustratedEmpty } from '@/components/app/empty-visual'
import { PeopleCards, type PersonCardData } from '@/components/app/people-cards'
import { Button } from '@/components/ui/button'
import { Container, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { relativeDay, pluralise } from '@/lib/format'
import { resolveFaces } from '@/lib/conversations/avatars'
import { brand } from '@/lib/brand'
import { findDuplicates } from './actions'
import { DuplicateReview } from '@/components/app/duplicate-review'
import { RestorePersonButton } from '@/components/app/person-lifecycle'
import { formatDateIn } from '@/lib/tz'

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

export default async function PeoplePage({
  searchParams,
}: {
  /** `view=archived`: the people removed from the active record. */
  searchParams: Promise<{ view?: string; removed?: string; deleted?: string }>
}) {
  const { view, removed, deleted } = await searchParams
  const { user, profile } = await requireOnboardedUser()
  const timeZone = profile.timezone ?? 'UTC'
  const now = new Date()

  const supabase = await createClient()

  if (view === 'archived') {
    return <ArchivedPeople userId={user.id} timeZone={timeZone} deleted={deleted === '1'} />
  }

  const { count: archivedCount } = await supabase
    .from('people')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .not('archived_at', 'is', null)

  const { data: people } = await supabase
    .from('people')
    .select(
      'id, full_name, preferred_name, job_title, relationship_type, relevance, last_interaction_at, last_researched_at, avatar_url, avatar_path, is_demo, organizations(name, domain)',
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
      companyDomain: person.organizations?.domain ?? null,
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

      {removed === '1' ? (
        <p role="status" className="text-ink-secondary mt-6 text-sm">
          Removed. They are in{' '}
          <Link
            href="/people?view=archived"
            className="text-accent-text underline-offset-2 hover:underline"
          >
            Archived
          </Link>
          , where you can restore them.
        </p>
      ) : null}

      {(archivedCount ?? 0) > 0 ? (
        <p className="mt-4">
          <Button asChild variant="quiet" size="sm" className="-ml-3">
            <Link href="/people?view=archived">
              <Archive className="size-3.5" aria-hidden="true" />
              Archived ({archivedCount})
            </Link>
          </Button>
        </p>
      ) : null}

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
        <PeopleCards people={cards} className="mt-6" />
      )}

      {list.length > 8 ? (
        <p className="text-ink-muted mt-6 flex items-center gap-2 text-xs">
          <Search className="size-3.5" aria-hidden="true" />
          Press <kbd className="border-line rounded border px-1.5 py-0.5 font-sans">⌘K</kbd> to jump
          to anyone.
        </p>
      ) : null}

      <details className="group mt-10">
        <summary className="text-ink-muted hover:text-ink inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-xs [&::-webkit-details-marker]:hidden">
          <Info className="size-3.5" aria-hidden="true" />
          About this record
        </summary>
        <p className="text-ink-muted max-w-xl text-xs leading-relaxed">
          This is your private working record of the people you interact with professionally. It is
          visible only to you, it focuses on professional context, and you can delete any person,
          any observation or the whole record at any time.
        </p>
      </details>
    </Container>
  )
}

async function ArchivedPeople({
  userId,
  timeZone,
  deleted,
}: {
  userId: string
  timeZone: string
  deleted: boolean
}) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('people')
    .select('id, full_name, preferred_name, archived_at, is_demo, organizations(name)')
    .eq('user_id', userId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
    .limit(500)
  const archived = data ?? []

  return (
    <Container size="default" className="py-8 sm:py-12">
      <Button asChild variant="quiet" size="sm" className="-ml-3">
        <Link href="/people">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          People
        </Link>
      </Button>
      <SectionHeader
        as="h1"
        eyebrow="Relationships"
        title="Archived"
        description="People you removed. They are out of search, new meetings, research and reminders, and do not count toward your plan. Their history is unchanged."
        className="mt-4"
      />

      {deleted ? (
        <p role="status" className="text-ink-secondary mt-6 text-sm">
          Deleted permanently.
        </p>
      ) : null}

      {archived.length === 0 ? (
        <p className="text-ink-muted mt-8 text-sm">Nobody is archived.</p>
      ) : (
        <ul className="divide-line border-line mt-8 divide-y rounded-[var(--radius-lg)] border">
          {archived.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <Link
                  href={`/people/${person.id}`}
                  className="text-ink text-sm font-medium underline-offset-2 hover:underline"
                >
                  {person.preferred_name || person.full_name}
                </Link>
                <p className="text-ink-muted mt-0.5 text-xs">
                  {[
                    person.organizations?.name,
                    person.is_demo ? 'Sample' : null,
                    person.archived_at
                      ? `Removed ${formatDateIn(person.archived_at, timeZone)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <RestorePersonButton personId={person.id} size="sm" />
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/people/${person.id}/delete`}>Delete permanently</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Container>
  )
}
