import Link from 'next/link'
import type { Metadata } from 'next'
import { Building2, Compass, TrendingDown, UserPlus } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge, Container, EmptyState, Eyebrow, Panel, Rule, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { daysSince, pluralise, relativeDay } from '@/lib/format'
import { brand } from '@/lib/brand'

export const metadata: Metadata = {
  title: 'Relationship Atlas',
  robots: { index: false, follow: false },
}

/**
 * THE RELATIONSHIP ATLAS
 * =============================================================================
 * Grouped by organisation and by signal, rather than rendered as a force-
 * directed graph. A node-and-edge diagram of your colleagues looks impressive
 * in a screenshot and tells you nothing you can act on; "these four people are
 * at the same company and two of them are going quiet" does.
 * =============================================================================
 */
export default async function AtlasPage() {
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()

  const [{ data: people }, { data: commitments }] = await Promise.all([
    supabase
      .from('people')
      .select(
        'id, full_name, preferred_name, job_title, relevance, relationship_type, last_interaction_at, avatar_url, organizations(id, name)',
      )
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('relevance', { ascending: false })
      .limit(300),
    supabase
      .from('commitments')
      .select('person_id, due_on')
      .eq('user_id', user.id)
      .eq('status', 'open'),
  ])

  const list = people ?? []
  const today = new Date().toISOString().slice(0, 10)

  const openByPerson = new Map<string, number>()
  const overdueByPerson = new Map<string, number>()
  for (const c of commitments ?? []) {
    if (!c.person_id) continue
    openByPerson.set(c.person_id, (openByPerson.get(c.person_id) ?? 0) + 1)
    if (c.due_on && c.due_on < today) {
      overdueByPerson.set(c.person_id, (overdueByPerson.get(c.person_id) ?? 0) + 1)
    }
  }

  // Group by organisation; people with none are collected separately rather
  // than dropped.
  const byOrg = new Map<string, { name: string; people: typeof list }>()
  const unaffiliated: typeof list = []
  for (const person of list) {
    const org = person.organizations
    if (!org) {
      unaffiliated.push(person)
      continue
    }
    const bucket = byOrg.get(org.id) ?? { name: org.name, people: [] }
    bucket.people.push(person)
    byOrg.set(org.id, bucket)
  }

  const organisations = [...byOrg.values()].sort((a, b) => b.people.length - a.people.length)

  // Signals: relationships the user said matter that have gone quiet, and
  // anything with an overdue promise attached.
  const goingQuiet = list
    .filter((p) => p.relevance >= 4)
    .map((p) => ({ person: p, days: daysSince(p.last_interaction_at) }))
    .filter((x) => x.days === null || x.days >= 30)
    .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999))
    .slice(0, 8)

  const withOverdue = list.filter((p) => (overdueByPerson.get(p.id) ?? 0) > 0)

  return (
    <Container size="default" className="py-8 sm:py-12">
      <SectionHeader
        as="h1"
        eyebrow="Overview"
        title="Relationship Atlas"
        description="Your working relationships grouped by organisation, and the signals worth acting on."
      />

      {list.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<Compass className="size-6" />}
          title="Nothing to map yet"
          description={`Add the people you work with and ${brand.name} will group them by organisation and surface which relationships need attention.`}
          action={
            <Button asChild>
              <Link href="/people/new">
                <UserPlus className="size-4" aria-hidden="true" />
                Add a person
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* --- signals ------------------------------------------------------ */}
          {(goingQuiet.length > 0 || withOverdue.length > 0) && (
            <section className="mt-10">
              <Eyebrow>Signals</Eyebrow>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {goingQuiet.length > 0 ? (
                  <Panel className="p-5">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="size-4 text-caution" aria-hidden="true" />
                      <p className="text-sm font-medium text-ink">Going quiet</p>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                      Relationships you marked important with no recent contact.
                    </p>
                    <ul className="mt-4 grid gap-2.5">
                      {goingQuiet.map(({ person, days }) => (
                        <li key={person.id}>
                          <Link
                            href={`/people/${person.id}`}
                            className="flex items-center gap-2.5 text-sm text-ink-secondary hover:text-ink"
                          >
                            <Avatar name={person.full_name} size="xs" />
                            <span className="min-w-0 flex-1 truncate">
                              {person.preferred_name || person.full_name}
                            </span>
                            <span className="shrink-0 text-xs text-ink-faint">
                              {days === null ? 'never' : `${days}d`}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                ) : null}

                {withOverdue.length > 0 ? (
                  <Panel className="p-5">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="size-4 text-critical" aria-hidden="true" />
                      <p className="text-sm font-medium text-ink">Overdue promises</p>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                      Something is past its date with these people.
                    </p>
                    <ul className="mt-4 grid gap-2.5">
                      {withOverdue.map((person) => (
                        <li key={person.id}>
                          <Link
                            href={`/people/${person.id}`}
                            className="flex items-center gap-2.5 text-sm text-ink-secondary hover:text-ink"
                          >
                            <Avatar name={person.full_name} size="xs" />
                            <span className="min-w-0 flex-1 truncate">
                              {person.preferred_name || person.full_name}
                            </span>
                            <Badge tone="critical">{overdueByPerson.get(person.id)}</Badge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                ) : null}
              </div>
            </section>
          )}

          <Rule />

          {/* --- by organisation ------------------------------------------------ */}
          <section>
            <Eyebrow>By organisation</Eyebrow>
            <div className="mt-5 grid gap-6">
              {organisations.map((org) => (
                <div key={org.name}>
                  <div className="flex items-center gap-2">
                    <Building2 className="size-4 text-ink-faint" aria-hidden="true" />
                    <h2 className="font-display text-lg text-ink">{org.name}</h2>
                    <span className="text-xs text-ink-muted">
                      {pluralise(org.people.length, 'person', 'people')}
                    </span>
                  </div>

                  <ul className="mt-3 grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-line bg-line sm:grid-cols-2">
                    {org.people.map((person) => (
                      <li key={person.id} className="bg-bg">
                        <Link
                          href={`/people/${person.id}`}
                          className="flex items-center gap-3 p-4 transition-colors hover:bg-bg-sunken"
                        >
                          <Avatar name={person.full_name} src={person.avatar_url} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink">
                              {person.preferred_name || person.full_name}
                            </span>
                            <span className="block truncate text-xs text-ink-muted">
                              {person.job_title ?? person.relationship_type.replace(/_/g, ' ')}
                            </span>
                          </span>
                          {(openByPerson.get(person.id) ?? 0) > 0 ? (
                            <Badge tone={overdueByPerson.get(person.id) ? 'critical' : 'neutral'}>
                              {openByPerson.get(person.id)} open
                            </Badge>
                          ) : person.last_interaction_at ? (
                            <span className="shrink-0 text-xs text-ink-faint">
                              {relativeDay(person.last_interaction_at)}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {unaffiliated.length > 0 ? (
                <div>
                  <h2 className="font-display text-lg text-ink">No organisation recorded</h2>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {unaffiliated.map((person) => (
                      <li key={person.id}>
                        <Link
                          href={`/people/${person.id}`}
                          className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-secondary hover:border-line-strong hover:text-ink"
                        >
                          <Avatar name={person.full_name} size="xs" />
                          {person.preferred_name || person.full_name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        </>
      )}
    </Container>
  )
}
