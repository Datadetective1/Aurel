import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  CalendarClock,
  Handshake,
  MessageSquare,
  MessagesSquare,
  Settings2,
  Sparkles,
} from 'lucide-react'
import { AddContext } from '@/components/app/add-context'
import { EvidenceBadge, EvidenceLine } from '@/components/app/evidence'
import { MemoryReview, type Proposal } from '@/components/app/memory-review'
import { ResearchPanel, SourceLink } from '@/components/app/research-panel'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge, Container, Eyebrow, Rule } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { researchCapability } from '@/lib/research/providers'
import { formatDate, relativeDay, pluralise } from '@/lib/format'
import { brand } from '@/lib/brand'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()
  const { data } = await supabase
    .from('people')
    .select('full_name, preferred_name')
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()

  return {
    title: data ? data.preferred_name || data.full_name : 'Person',
    robots: { index: false, follow: false },
  }
}

const RELATIONSHIP_LABEL: Record<string, string> = {
  manager: 'Your manager',
  report: 'Your report',
  skip_level: 'Your skip-level',
  peer: 'Peer',
  cross_functional: 'Cross-functional partner',
  customer: 'Customer',
  prospect: 'Prospect',
  vendor: 'Vendor',
  partner: 'Partner',
  candidate: 'Candidate',
  mentor: 'Your mentor',
  external: 'External contact',
  other: 'Colleague',
}

const CATEGORY_LABEL: Record<string, string> = {
  communication: 'How to communicate with them',
  decision: 'How they decide',
  trust: 'What builds trust',
  friction: 'Potential friction',
  priority: 'What matters to them',
  preference: 'Preferences',
  context: 'Context',
  other: 'Other',
}

const FACT_GROUPS: { kinds: string[]; label: string }[] = [
  { kinds: ['current_role', 'current_organization'], label: 'Professional identity' },
  { kinds: ['prior_role', 'education'], label: 'Career' },
  { kinds: ['expertise'], label: 'Expertise' },
  { kinds: ['theme'], label: 'Recurring public themes' },
  { kinds: ['publication', 'appearance'], label: 'Published and public appearances' },
  { kinds: ['communication_signal'], label: 'Public communication signals' },
]

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user } = await requireOnboardedUser()
  const supabase = await createClient()

  const { data: person } = await supabase
    .from('people')
    .select(
      'id, full_name, preferred_name, job_title, email, profile_url, relationship_type, relevance, notes, avatar_url, first_interaction_at, last_interaction_at, last_researched_at, is_demo, organizations(name)',
    )
    .eq('user_id', user.id)
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle()

  if (!person) notFound()

  const name = person.preferred_name || person.full_name

  const [
    { data: observations },
    { data: facts },
    { data: sources },
    { data: commitments },
    { data: participations },
    { data: notes },
    { data: pulse },
  ] = await Promise.all([
    supabase
      .from('observations')
      .select('id, content, category, evidence_level, status, reinforcement_count, created_at')
      .eq('user_id', user.id)
      .eq('person_id', id)
      .neq('status', 'dismissed')
      .order('reinforcement_count', { ascending: false }),
    supabase
      .from('professional_facts')
      .select('id, kind, value, detail, evidence_level, is_current, has_conflict, as_of')
      .eq('user_id', user.id)
      .eq('person_id', id)
      .order('is_current', { ascending: false }),
    supabase
      .from('sources')
      .select(
        'id, source_title, source_url, publisher, source_type, access_status, retrieved_at, published_at',
      )
      .eq('user_id', user.id)
      .in(
        'id',
        (
          await supabase
            .from('source_person_links')
            .select('source_id')
            .eq('user_id', user.id)
            .eq('person_id', id)
            .neq('identity_match_status', 'no_match')
        ).data?.map((l) => l.source_id) ?? ['00000000-0000-0000-0000-000000000000'],
      )
      .order('retrieved_at', { ascending: false }),
    supabase
      .from('commitments')
      .select('id, description, owner, due_on, status')
      .eq('user_id', user.id)
      .eq('person_id', id)
      .order('status', { ascending: true })
      .order('due_on', { ascending: true, nullsFirst: false }),
    supabase
      .from('interaction_participants')
      .select('interactions(id, title, occurred_at, kind, summary, outcome, went_well)')
      .eq('user_id', user.id)
      .eq('person_id', id),
    supabase
      .from('notes')
      .select('id, body, created_at')
      .eq('user_id', user.id)
      .eq('person_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.rpc('relationship_pulse', { target_person: id }).maybeSingle(),
  ])

  // Excerpts backing each proposal, so the review gate can show its basis.
  const proposedIds = (observations ?? []).filter((o) => o.status === 'proposed').map((o) => o.id)
  const { data: proposalSources } = proposedIds.length
    ? await supabase
        .from('observation_sources')
        .select('observation_id, excerpt, sources(source_title, publisher)')
        .eq('user_id', user.id)
        .in('observation_id', proposedIds)
    : { data: [] as { observation_id: string; excerpt: string | null; sources: { source_title: string | null; publisher: string | null } | null }[] }

  const basisByObservation = new Map<string, { basis: string | null; excerpt: string | null }>()
  for (const row of proposalSources ?? []) {
    basisByObservation.set(row.observation_id, {
      basis: row.sources?.source_title ?? row.sources?.publisher ?? null,
      excerpt: row.excerpt,
    })
  }

  const proposals: Proposal[] = (observations ?? [])
    .filter((o) => o.status === 'proposed')
    .map((o) => ({
      id: o.id,
      content: o.content,
      evidenceLevel: o.evidence_level,
      category: o.category,
      basis: basisByObservation.get(o.id)?.basis ?? null,
      excerpt: basisByObservation.get(o.id)?.excerpt ?? null,
    }))

  const active = (observations ?? []).filter((o) => o.status === 'active')
  const byCategory = new Map<string, typeof active>()
  for (const o of active) {
    byCategory.set(o.category, [...(byCategory.get(o.category) ?? []), o])
  }

  const interactions = (participations ?? [])
    .map((p) => p.interactions)
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))

  const openCommitments = (commitments ?? []).filter((c) => c.status === 'open')
  const capability = researchCapability()
  const currentFacts = (facts ?? []).filter((f) => f.is_current)
  const hasFootprint = currentFacts.length > 0

  return (
    <Container size="default" className="py-8 sm:py-12">
      {/* --- header ----------------------------------------------------------- */}
      <header className="flex flex-wrap items-start gap-5">
        <Avatar name={person.full_name} src={person.avatar_url} size="xl" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl text-ink sm:text-4xl">{name}</h1>
            {person.is_demo ? <Badge tone="outline">Demo</Badge> : null}
          </div>

          <p className="mt-1.5 text-sm text-ink-secondary">
            {[person.job_title, person.organizations?.name].filter(Boolean).join(' · ') ||
              'No role recorded'}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{RELATIONSHIP_LABEL[person.relationship_type]}</Badge>
            <Badge tone="outline">Importance {person.relevance}/5</Badge>
            {person.last_interaction_at ? (
              <Badge tone="neutral">
                Last spoke {relativeDay(person.last_interaction_at).toLowerCase()}
              </Badge>
            ) : (
              <Badge tone="outline">No interactions yet</Badge>
            )}
          </div>
        </div>

        <Button asChild variant="ghost" size="icon" aria-label={`Edit ${name}`}>
          <Link href={`/people/${id}/edit`}>
            <Settings2 className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </header>

      {/* --- quick actions ---------------------------------------------------- */}
      <div className="mt-7 flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/prepare?person=${id}`}>
            <Sparkles className="size-4" aria-hidden="true" />
            Prepare
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/coach?person=${id}`}>
            <MessagesSquare className="size-4" aria-hidden="true" />
            Ask about {name.split(' ')[0]}
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/coach?person=${id}&mode=adapt`}>
            <MessageSquare className="size-4" aria-hidden="true" />
            Draft a message
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/people/${id}/log`}>
            <CalendarClock className="size-4" aria-hidden="true" />
            Log an interaction
          </Link>
        </Button>
      </div>

      {/* --- memory review gate ----------------------------------------------- */}
      {proposals.length > 0 ? (
        <div className="mt-9">
          <MemoryReview proposals={proposals} personName={name} />
        </div>
      ) : null}

      {/* --- relationship snapshot -------------------------------------------- */}
      <Rule />

      <section>
        <Eyebrow>Your relationship</Eyebrow>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-secondary">
          {interactions.length === 0 ? (
            <>
              No interactions recorded yet. {brand.name} has nothing to tell you about working with{' '}
              {name} until you log one — that is where this starts compounding.
            </>
          ) : (
            <>
              {pluralise(interactions.length, 'recorded interaction')}
              {person.first_interaction_at
                ? `, first on ${formatDate(person.first_interaction_at)}`
                : ''}
              . {active.length > 0 ? `${pluralise(active.length, 'thing')} learned so far.` : ''}
            </>
          )}
        </p>

        {pulse ? <RelationshipPulse pulse={pulse} /> : null}
      </section>

      {/* --- what you have learned -------------------------------------------- */}
      {active.length > 0 ? (
        <>
          <Rule />
          <section>
            <Eyebrow>What you have learned</Eyebrow>
            <div className="mt-5 grid gap-8">
              {[...byCategory.entries()].map(([category, items]) => (
                <div key={category}>
                  <h3 className="text-sm font-medium text-ink">
                    {CATEGORY_LABEL[category] ?? category}
                  </h3>
                  <ul className="mt-3 grid gap-3.5">
                    {items.map((o) => (
                      <EvidenceLine
                        key={o.id}
                        content={o.content}
                        level={o.evidence_level}
                        reinforcementCount={o.reinforcement_count}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {/* --- public footprint -------------------------------------------------- */}
      <Rule />

      <ResearchPanel
        personId={id}
        personName={name}
        canDiscover={capability.canDiscover}
        discoveryHint={capability.discoveryHint}
        hasProfileUrl={Boolean(person.profile_url)}
        lastResearchedAt={person.last_researched_at}
        sourceCount={(sources ?? []).length}
      />

      {hasFootprint ? (
        <section className="mt-8 grid gap-8">
          {FACT_GROUPS.map((group) => {
            const groupFacts = currentFacts.filter((f) => group.kinds.includes(f.kind))
            if (groupFacts.length === 0) return null

            return (
              <div key={group.label}>
                <h3 className="text-sm font-medium text-ink">{group.label}</h3>
                <ul className="mt-3 grid gap-3.5">
                  {groupFacts.map((fact) => (
                    <li key={fact.id} className="flex gap-3">
                      <span aria-hidden="true" className="mt-2.5 h-px w-3 shrink-0 bg-line-strong" />
                      <div className="min-w-0">
                        <p className="text-sm leading-relaxed text-ink">
                          {fact.value}
                          {fact.detail ? (
                            <span className="text-ink-muted"> — {fact.detail}</span>
                          ) : null}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <EvidenceBadge level={fact.evidence_level} />
                          {/* Freshness: a five-year-old title must not read as current. */}
                          {fact.as_of ? (
                            <span className="text-[0.6875rem] text-ink-faint">
                              as of {formatDate(fact.as_of)}
                            </span>
                          ) : null}
                          {fact.has_conflict ? (
                            <Badge tone="caution">Sources disagree</Badge>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </section>
      ) : null}

      {/* --- sources ----------------------------------------------------------- */}
      {(sources ?? []).length > 0 ? (
        <section className="mt-8">
          <Eyebrow>Sources</Eyebrow>
          <ul className="mt-3 grid gap-2">
            {(sources ?? []).map((source) => (
              <li
                key={source.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-2.5"
              >
                <SourceLink
                  title={source.source_title}
                  url={source.source_url}
                  publisher={source.publisher}
                />
                <div className="flex items-center gap-2">
                  <Badge tone="outline">{source.source_type.replace(/_/g, ' ')}</Badge>
                  {source.access_status === 'identity_uncertain' ? (
                    <Badge tone="caution">Unconfirmed match</Badge>
                  ) : null}
                  <span className="text-[0.6875rem] text-ink-faint">
                    {source.retrieved_at ? formatDate(source.retrieved_at) : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* --- add context -------------------------------------------------------- */}
      <div className="mt-8 rounded-[var(--radius-lg)] border border-line bg-bg-sunken p-5 sm:p-6">
        <AddContext personId={id} personName={person.full_name} />
      </div>

      {/* --- commitments --------------------------------------------------------- */}
      {(commitments ?? []).length > 0 ? (
        <>
          <Rule />
          <section>
            <Eyebrow>Commitments</Eyebrow>
            <ul className="mt-4 grid gap-2">
              {(commitments ?? []).map((c) => {
                const overdue =
                  c.status === 'open' && c.due_on && c.due_on < new Date().toISOString().slice(0, 10)
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3"
                  >
                    <Handshake
                      className={`size-4 shrink-0 ${overdue ? 'text-critical' : 'text-ink-faint'}`}
                      aria-hidden="true"
                    />
                    <span
                      className={`min-w-0 flex-1 text-sm ${c.status === 'done' ? 'text-ink-muted line-through' : 'text-ink'}`}
                    >
                      {c.description}
                    </span>
                    <Badge tone="outline">
                      {c.owner === 'user' ? 'You owe' : c.owner === 'person' ? 'They owe' : 'Shared'}
                    </Badge>
                    {c.due_on ? (
                      <Badge tone={overdue ? 'critical' : 'neutral'}>{relativeDay(c.due_on)}</Badge>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      ) : null}

      {/* --- interaction timeline ------------------------------------------------ */}
      {interactions.length > 0 ? (
        <>
          <Rule />
          <section>
            <Eyebrow>Interaction timeline</Eyebrow>
            <ol className="mt-5 grid gap-6 border-l border-line pl-5">
              {interactions.map((interaction) => (
                <li key={interaction.id} className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[1.4375rem] top-2 size-1.5 rounded-full bg-accent-graphic ring-4 ring-bg"
                  />
                  <p className="text-xs text-ink-muted">
                    {formatDate(interaction.occurred_at)} · {interaction.kind}
                  </p>
                  <p className="mt-1 text-sm font-medium text-ink">{interaction.title}</p>
                  {interaction.summary ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
                      {interaction.summary}
                    </p>
                  ) : null}
                  {interaction.outcome ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
                      <span className="text-ink-muted">Outcome — </span>
                      {interaction.outcome}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : null}

      {/* --- notes ---------------------------------------------------------------- */}
      {(notes ?? []).length > 0 ? (
        <>
          <Rule />
          <section>
            <Eyebrow>Notes</Eyebrow>
            <ul className="mt-4 grid gap-3">
              {(notes ?? []).map((note) => (
                <li key={note.id} className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">{note.body}</p>
                  <p className="mt-2 text-xs text-ink-faint">{formatDate(note.created_at)}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {openCommitments.length === 0 && interactions.length === 0 && active.length === 0 ? (
        <p className="mt-10 max-w-xl text-xs leading-relaxed text-ink-muted">
          This page fills in as you use it. Research their public footprint, paste a link or a note
          above, or log your next conversation — after a few interactions {brand.name} will be
          briefing you on your actual relationship rather than on general principles.
        </p>
      ) : null}
    </Container>
  )
}

/**
 * Relationship Pulse.
 * Measures the user's own follow-through and contact cadence. It deliberately
 * does NOT claim to measure how the other person feels, and every input is
 * shown so the number is inspectable rather than mysterious.
 */
function RelationshipPulse({
  pulse,
}: {
  pulse: {
    score: number
    days_since_contact: number
    open_commitments: number
    overdue_commitments: number
    interaction_count: number
    has_upcoming: boolean
  }
}) {
  const tone = pulse.score >= 70 ? 'positive' : pulse.score >= 40 ? 'caution' : 'critical'

  return (
    <div className="mt-6 rounded-[var(--radius-md)] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Eyebrow>Relationship pulse</Eyebrow>
        <Badge tone={tone}>{pulse.score}/100</Badge>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-secondary">
        <li>
          {pulse.days_since_contact >= 0
            ? `${pulse.days_since_contact} days since contact`
            : 'No contact recorded'}
        </li>
        <li>{pluralise(pulse.interaction_count, 'interaction')}</li>
        <li>{pluralise(pulse.open_commitments, 'open commitment')}</li>
        {pulse.overdue_commitments > 0 ? (
          <li className="text-critical">{pulse.overdue_commitments} overdue</li>
        ) : null}
        <li>{pulse.has_upcoming ? 'Meeting scheduled' : 'Nothing scheduled'}</li>
      </ul>
      <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-faint">
        This reflects your contact cadence and follow-through — not how the other person feels.
      </p>
    </div>
  )
}
