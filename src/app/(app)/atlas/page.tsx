import Link from 'next/link'
import type { Metadata } from 'next'
import { TrendingDown, UserPlus } from 'lucide-react'
import { CompanyMark } from '@/components/visual/company-mark'
import { AtlasConnections, AtlasLegend } from '@/components/visual/atlas-connections'
import { describeConnection, findConnections } from '@/lib/visual/commonality'
import type { VisualConnection } from '@/lib/visual/types'
import { Avatar } from '@/components/ui/avatar'
import { IllustratedEmpty } from '@/components/app/empty-visual'
import { PersonNode, type PersonNodeData } from '@/components/app/person-node'
import { Button } from '@/components/ui/button'
import { Badge, Container, Eyebrow, Panel, Rule, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { daysSince, pluralise, relativeDay } from '@/lib/format'
import { isOverdueIn } from '@/lib/tz'
import { brand } from '@/lib/brand'
import { resolveFaces } from '@/lib/conversations/avatars'

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
  const { user, profile } = await requireOnboardedUser()
  const timeZone = profile.timezone ?? 'UTC'
  const now = new Date()

  const supabase = await createClient()

  const [
    { data: people },
    { data: commitments },
    { data: facts },
    { data: attendance },
    { data: participation },
  ] = await Promise.all([
    supabase
      .from('people')
      .select(
        'id, full_name, preferred_name, job_title, relevance, relationship_type, last_interaction_at, avatar_url, avatar_path, organization_id, organizations(id, name, domain)',
      )
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('relevance', { ascending: false })
      .limit(300),
    supabase
      .from('commitments')
      .select('person_id, due_on')
      .eq('user_id', user.id)
      .eq('status', 'open')
      .eq('review_status', 'confirmed'),
    // The evidence connections may rest on: sourced facts about past employers
    // and schools, and who was in which meeting and conversation together.
    supabase
      .from('professional_facts')
      .select('person_id, kind, value, evidence_level')
      .eq('user_id', user.id)
      .in('kind', ['prior_role', 'education'])
      .in('evidence_level', ['confirmed', 'observed'])
      .limit(2000),
    supabase
      .from('meeting_attendees')
      .select('meeting_id, person_id')
      .eq('user_id', user.id)
      .limit(3000),
    supabase
      .from('interaction_participants')
      .select('interaction_id, person_id')
      .eq('user_id', user.id)
      .limit(3000),
  ])

  const faces = await resolveFaces(supabase, people ?? [], (p) => p.id)

  const list = people ?? []

  const openByPerson = new Map<string, number>()
  const overdueByPerson = new Map<string, number>()
  for (const c of commitments ?? []) {
    if (!c.person_id) continue
    openByPerson.set(c.person_id, (openByPerson.get(c.person_id) ?? 0) + 1)
    if (isOverdueIn(c.due_on, timeZone, now)) {
      overdueByPerson.set(c.person_id, (overdueByPerson.get(c.person_id) ?? 0) + 1)
    }
  }

  // Group by organisation; people with none are collected separately rather
  // than dropped.
  const byOrg = new Map<string, { name: string; domain: string | null; people: typeof list }>()
  const unaffiliated: typeof list = []
  for (const person of list) {
    const org = person.organizations
    if (!org) {
      unaffiliated.push(person)
      continue
    }
    const bucket = byOrg.get(org.id) ?? { name: org.name, domain: org.domain, people: [] }
    bucket.people.push(person)
    byOrg.set(org.id, bucket)
  }

  // --- connections on record ------------------------------------------------
  // Same-organisation pairs are already visible in the grouping below, so the
  // list shows the connections the grouping cannot: shared history, and
  // sourced facts in common.
  const group = <K extends string>(rows: { person_id: string }[] | null, key: (r: never) => K) => {
    const map = new Map<string, string[]>()
    for (const r of rows ?? []) {
      const k = key(r as never)
      map.set(k, [...(map.get(k) ?? []), r.person_id])
    }
    return [...map.entries()].map(([id, personIds]) => ({ id, personIds }))
  }
  const connectionOrder = ['shared_conversation', 'shared_meeting', 'former_employer', 'education']
  const connections: VisualConnection[] = findConnections({
    people: list.map((p) => ({
      id: p.id,
      organizationId: p.organization_id,
      organizationName: p.organizations?.name ?? null,
    })),
    facts: (facts ?? []).map((f) => ({
      personId: f.person_id,
      kind: f.kind,
      value: f.value,
      evidence: f.evidence_level,
    })),
    meetings: group(attendance, (r: { meeting_id: string }) => r.meeting_id),
    conversations: group(participation, (r: { interaction_id: string }) => r.interaction_id),
  })
    .filter((c) => c.kind !== 'same_organization')
    .sort(
      (a, b) =>
        connectionOrder.indexOf(a.kind) - connectionOrder.indexOf(b.kind) || b.count - a.count,
    )
    .slice(0, 12)
    .map((c) => ({ ...c, description: describeConnection(c) }))
  const atlasPeople = new Map(
    list.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.preferred_name || p.full_name,
        fullName: p.full_name,
        src: faces.get(p.id) ?? null,
      },
    ]),
  )

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

  // A face on the map, with the one fact that says how the relationship is
  // doing: what is overdue, what is open, or when you last spoke.
  const node = (person: (typeof list)[number]): PersonNodeData => {
    const open = openByPerson.get(person.id) ?? 0
    const overdue = overdueByPerson.get(person.id) ?? 0
    return {
      id: person.id,
      name: person.preferred_name || person.full_name,
      fullName: person.full_name,
      src: faces.get(person.id) ?? null,
      title: person.job_title,
      company: person.organizations?.name ?? null,
      status: overdue
        ? `${overdue} overdue`
        : open
          ? `${open} open`
          : person.last_interaction_at
            ? `Last spoke ${relativeDay(person.last_interaction_at, timeZone, now).toLowerCase()}`
            : 'No contact recorded',
      statusTone: overdue ? 'critical' : open ? 'caution' : 'neutral',
    }
  }

  return (
    <Container size="default" className="py-8 sm:py-12">
      <SectionHeader
        as="h1"
        eyebrow="Overview"
        title="Relationship Atlas"
        description="Every person you track, grouped by where they work, with the relationships going quiet surfaced before you notice yourself."
      />

      {list.length === 0 ? (
        <IllustratedEmpty
          className="mt-10"
          subject="atlas"
          tone="wash"
          title="Nothing to map yet"
          // "Atlas" tells a new user nothing, and neither did the old copy.
          // What it is for is the part worth saying: this is the view that
          // gets more useful the longer the account runs, because it is built
          // out of contact you have actually recorded.
          description={`This is the long view. Once you are tracking a few people, ${brand.name} groups them by where they work and flags the relationships going quiet — the ones you would not notice slipping until you needed them.`}
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
                      <TrendingDown className="text-caution size-4" aria-hidden="true" />
                      <p className="text-ink text-sm font-medium">Going quiet</p>
                    </div>
                    <p className="text-ink-muted mt-1.5 text-xs leading-relaxed">
                      Relationships you marked important with no recent contact.
                    </p>
                    <ul className="mt-4 grid gap-2.5">
                      {goingQuiet.map(({ person, days }) => (
                        <li key={person.id}>
                          <Link
                            href={`/people/${person.id}`}
                            className="text-ink-secondary hover:text-ink flex items-center gap-2.5 text-sm"
                          >
                            <Avatar
                              name={person.full_name}
                              src={faces.get(person.id) ?? null}
                              size="sm"
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {person.preferred_name || person.full_name}
                            </span>
                            <span className="text-ink-faint shrink-0 text-xs">
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
                      <TrendingDown className="text-critical size-4" aria-hidden="true" />
                      <p className="text-ink text-sm font-medium">Overdue promises</p>
                    </div>
                    <p className="text-ink-muted mt-1.5 text-xs leading-relaxed">
                      Something is past its date with these people.
                    </p>
                    <ul className="mt-4 grid gap-2.5">
                      {withOverdue.map((person) => (
                        <li key={person.id}>
                          <Link
                            href={`/people/${person.id}`}
                            className="text-ink-secondary hover:text-ink flex items-center gap-2.5 text-sm"
                          >
                            <Avatar
                              name={person.full_name}
                              src={faces.get(person.id) ?? null}
                              size="sm"
                            />
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

          {/* --- connections on record ---------------------------------------- */}
          <Rule />
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <Eyebrow>Connections on record</Eyebrow>
                <p className="text-ink-muted mt-2 max-w-xl text-xs leading-relaxed">
                  Only what your record holds at both ends: meetings and conversations you kept
                  together, and past employers or schools in sourced facts. Nothing is guessed.
                </p>
              </div>
              <AtlasLegend />
            </div>
            {connections.length > 0 ? (
              <AtlasConnections className="mt-5" connections={connections} people={atlasPeople} />
            ) : (
              <p className="text-ink-muted mt-4 text-sm">
                No connections between people on record yet. They appear once two people share a
                meeting, a conversation, or a sourced fact.
              </p>
            )}
          </section>

          <Rule />

          {/* --- by organisation ------------------------------------------------ */}
          <section>
            <Eyebrow>By organization</Eyebrow>
            <div className="mt-5 grid gap-6">
              {organisations.map((org) => (
                <div key={org.name}>
                  <div className="flex items-center gap-2">
                    <CompanyMark name={org.name} domain={org.domain} size="md" />
                    <h2 className="font-display text-ink text-lg">{org.name}</h2>
                    <span className="text-ink-muted text-xs">
                      {pluralise(org.people.length, 'person', 'people')}
                    </span>
                  </div>

                  <ul className="mt-3 flex flex-wrap gap-1">
                    {org.people.map((person) => (
                      <li key={person.id}>
                        <PersonNode person={node(person)} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {unaffiliated.length > 0 ? (
                <div>
                  <h2 className="font-display text-ink text-lg">No organization recorded</h2>
                  <ul className="mt-3 flex flex-wrap gap-1">
                    {unaffiliated.map((person) => (
                      <li key={person.id}>
                        <PersonNode person={node(person)} />
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
