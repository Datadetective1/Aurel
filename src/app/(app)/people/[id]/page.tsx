import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  ArrowRight,
  Globe,
  MessageSquare,
  MessagesSquare,
  Mic,
  Settings2,
  Sparkles,
} from 'lucide-react'
import { AddContext } from '@/components/app/add-context'
import { AddDocument } from '@/components/app/add-document'
import { ConversationCard } from '@/components/app/conversation-card'
import { PersonHero, type HeroFact } from '@/components/app/person-hero'
import { EvidenceBadge } from '@/components/app/evidence'
import { ProvenanceLabel, provenanceFor } from '@/components/app/provenance'
import { MemoryReview, type Proposal } from '@/components/app/memory-review'
import { ResearchPanel } from '@/components/app/research-panel'
import { SourceRow, type SourceRowData } from '@/components/app/source-controls'
import { PersonGlance } from '@/components/visual/person-glance'
import { PersonRelationshipSections } from '@/components/app/person-sections'
import {
  FindPhotoButton,
  PhotoSuggestionCard,
  type PhotoSuggestionView,
} from '@/components/visual/photo-suggestion'
import { Button } from '@/components/ui/button'
import { Badge, Container, Eyebrow, Rule } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { researchCapability } from '@/lib/research/providers'
import { resolveFace } from '@/lib/conversations/avatars'
import { loadPersonRecordVisual } from '@/lib/visual/person.server'
import { countDirections } from '@/lib/visual/relationship-actions'
import { pendingSuggestion, photoSuggestionsAvailable } from '@/lib/photos/suggestions'
import { AVATAR_BUCKET } from '@/lib/conversations/avatars'
import { track } from '@/lib/analytics'
import { formatPublishedDate, pluralise } from '@/lib/format'

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

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, profile } = await requireOnboardedUser()
  const timeZone = profile.timezone ?? 'UTC'
  const now = new Date()
  const supabase = await createClient()

  const { data: person } = await supabase
    .from('people')
    .select(
      'id, full_name, preferred_name, job_title, email, profile_url, relationship_type, relevance, notes, avatar_url, avatar_path, first_interaction_at, last_interaction_at, last_researched_at, is_demo, organization_id, organizations(name)',
    )
    .eq('user_id', user.id)
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle()

  if (!person) notFound()

  const name = person.preferred_name || person.full_name

  const firstName = name.split(' ')[0] ?? name

  const [
    { data: observations },
    { data: facts },
    { data: sourceLinks },
    { data: participations },
    face,
    record,
    { data: organization },
  ] = await Promise.all([
    supabase
      .from('observations')
      .select(
        'id, content, category, evidence_level, status, reinforcement_count, source_kind, created_at',
      )
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
    // Includes sources the user marked as someone else. Hiding them would make
    // that correction irreversible from the interface, which is the opposite of
    // giving the user control over their own record.
    supabase
      .from('source_person_links')
      .select(
        'identity_match_status, sources(id, source_title, source_url, publisher, author, source_type, access_status, retrieved_at, published_at)',
      )
      .eq('user_id', user.id)
      .eq('person_id', id),
    supabase
      .from('interaction_participants')
      .select('interaction_id')
      .eq('user_id', user.id)
      .eq('person_id', id),
    resolveFace(supabase, person),
    loadPersonRecordVisual(supabase, user.id, id, { firstName, timeZone, now }),
    person.organization_id
      ? supabase
          .from('organizations')
          .select('domain')
          .eq('id', person.organization_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const { activeLoops: loops, conversations, nextMeeting } = record

  // --- a face suggestion waiting on the user (migration 0020) ----------------
  // Absent table, absent suggestion: the flow simply does not appear.
  let photoSuggestion: PhotoSuggestionView | null = null
  let canFindPhoto = false
  if (!face) {
    const pending = await pendingSuggestion(supabase, user.id, id)
    if (pending?.storage_path) {
      const { data: signed } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(pending.storage_path, 60 * 60)
      if (signed?.signedUrl) {
        photoSuggestion = {
          id: pending.id,
          src: signed.signedUrl,
          sourceUrl: pending.source_url,
          sourceLabel: pending.source_label,
        }
        await track('profile_photo_suggestion_shown', { provider: pending.provider })
      }
    } else if (
      (sourceLinks ?? []).some((l) => l.identity_match_status === 'confirmed') &&
      (await photoSuggestionsAvailable(supabase))
    ) {
      canFindPhoto = true
    }
  }
  const interactionCount = (participations ?? []).length
  const directions = countDirections(loops)
  const closedCount = record.allLoops.filter(
    (l) =>
      l.reviewStatus === 'confirmed' &&
      (l.status === 'done' || l.status === 'cancelled' || l.status === 'dropped'),
  ).length

  // --- sources, with what each one is actually holding up --------------------
  const sourceRows = (sourceLinks ?? [])
    .flatMap((link) =>
      link.sources ? [{ status: link.identity_match_status, src: link.sources }] : [],
    )
    .sort((a, b) => (b.src.retrieved_at ?? '').localeCompare(a.src.retrieved_at ?? ''))

  const sourceIds = sourceRows.map((r) => r.src.id)

  // Counts let the delete confirmation say exactly what will be withdrawn,
  // rather than a generic "this cannot be undone".
  const [{ data: factLinks }, { data: obsLinks }] = sourceIds.length
    ? await Promise.all([
        supabase
          .from('fact_sources')
          .select('source_id, fact_id')
          .eq('user_id', user.id)
          .in('source_id', sourceIds),
        supabase
          .from('observation_sources')
          .select('source_id, observation_id')
          .eq('user_id', user.id)
          .in('source_id', sourceIds),
      ])
    : [{ data: [] }, { data: [] }]

  const countBySource = (rows: { source_id: string | null }[] | null) => {
    const map = new Map<string, number>()
    for (const r of rows ?? []) {
      if (!r.source_id) continue
      map.set(r.source_id, (map.get(r.source_id) ?? 0) + 1)
    }
    return map
  }
  const factCounts = countBySource(factLinks)
  const observationCounts = countBySource(obsLinks)

  const sources: SourceRowData[] = sourceRows.map(({ status, src }) => ({
    id: src.id,
    title: src.source_title,
    url: src.source_url,
    publisher: src.publisher,
    author: src.author,
    sourceType: src.source_type,
    retrievedAt: src.retrieved_at,
    publishedAt: src.published_at,
    accessStatus: src.access_status,
    identityStatus: status,
    factCount: factCounts.get(src.id) ?? 0,
    observationCount: observationCounts.get(src.id) ?? 0,
  }))

  // Excerpts backing each proposal, so the review gate can show its basis.
  const proposedIds = (observations ?? []).filter((o) => o.status === 'proposed').map((o) => o.id)
  const { data: proposalSources } = proposedIds.length
    ? await supabase
        .from('observation_sources')
        .select('observation_id, excerpt, sources(source_title, publisher)')
        .eq('user_id', user.id)
        .in('observation_id', proposedIds)
    : {
        data: [] as {
          observation_id: string
          excerpt: string | null
          sources: { source_title: string | null; publisher: string | null } | null
        }[],
      }

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

  const capability = researchCapability()
  const currentFacts = (facts ?? []).filter((f) => f.is_current)
  const hasFootprint = currentFacts.length > 0

  // Beside the portrait: what they are to you and how much they matter. When
  // you last spoke and when you next meet moved to the glance below, where
  // they read as facts rather than as badges.
  const heroFacts: HeroFact[] = [
    ...(person.is_demo ? [{ label: 'Demo', tone: 'outline' as const }] : []),
    { label: RELATIONSHIP_LABEL[person.relationship_type] ?? 'Colleague' },
    { label: `Importance ${person.relevance}/5`, tone: 'outline' },
  ]

  return (
    <Container size="default" className="py-8 sm:py-12">
      {/* --- who ------------------------------------------------------------- */}
      {/* "This is Jonathan." before anything about Jonathan. The portrait is
          the anchor of the page; the facts that place the relationship sit
          beside it and the actions sit beneath the name. */}
      <PersonHero
        personId={id}
        name={name}
        fullName={person.full_name}
        src={face}
        title={person.job_title}
        company={person.organizations?.name ?? null}
        companyDomain={organization?.domain ?? null}
        facts={heroFacts}
        actions={
          <>
            <Button asChild>
              <Link href={`/prepare?person=${id}`}>
                <Sparkles className="size-4" aria-hidden="true" />
                Prepare
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/conversations/new?person=${id}`}>
                <Mic className="size-4" aria-hidden="true" />
                Capture
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/coach?person=${id}`}>
                <MessagesSquare className="size-4" aria-hidden="true" />
                Ask
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={`Draft a message to ${firstName}`}
            >
              <Link href={`/coach?person=${id}&mode=adapt`}>
                <MessageSquare className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={`Edit ${name}`}
            >
              <Link href={`/people/${id}/edit`}>
                <Settings2 className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </>
        }
      />

      {canFindPhoto ? <FindPhotoButton personId={id} className="mt-3" /> : null}

      {photoSuggestion ? (
        <PhotoSuggestionCard
          className="mt-4"
          personId={id}
          personName={person.full_name}
          suggestion={photoSuggestion}
        />
      ) : null}

      {/* --- what matters now ---------------------------------------------------- */}
      <PersonGlance
        className="mt-5"
        firstName={firstName}
        lastInteractionAt={person.last_interaction_at}
        firstInteractionAt={person.first_interaction_at}
        nextMeeting={nextMeeting}
        directions={directions}
        themes={record.themes}
        timeZone={timeZone}
        now={now}
      />

      {/* --- memory review gate ----------------------------------------------- */}
      {/* Anchored so the research panel's "N to review" can point at it. */}
      {proposals.length > 0 ? (
        <div id="proposals" className="mt-9 scroll-mt-6">
          <MemoryReview proposals={proposals} personName={name} />
        </div>
      ) : null}

      <PersonRelationshipSections
        personId={id}
        name={name}
        firstName={firstName}
        loops={loops}
        closedCount={closedCount}
        learned={[...byCategory.entries()].map(([category, items]) => ({
          category,
          label: CATEGORY_LABEL[category] ?? category,
          items: items.map((o) => ({
            id: o.id,
            content: o.content,
            level: o.evidence_level,
            provenance: provenanceFor(o.source_kind, o.evidence_level),
            reinforcementCount: o.reinforcement_count,
          })),
        }))}
        interactionCount={interactionCount}
        timeline={record.timeline}
        timeZone={timeZone}
        now={now}
      />

      {/* --- conversations waiting on the user, or the last few ------------------- */}
      {conversations.length > 0 ? (
        <>
          <Rule />
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Eyebrow>Recent conversations</Eyebrow>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/conversations/new?person=${id}`}>
                  Capture another
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <ul className="mt-4 grid gap-3">
              {conversations.slice(0, 3).map((c) => (
                <ConversationCard key={c.id} conversation={c} timeZone={timeZone} now={now} />
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {/* --- public footprint ------------------------------------------------------ */}
      {/* Who they are professionally, from public material. Behind a disclosure:
          it is reference, not what you act on, and it is the longest block on
          the page. The research controls stay in view. */}
      <Rule />

      <ResearchPanel
        personId={id}
        personName={name}
        canDiscover={capability.canDiscover}
        discoveryHint={capability.discoveryHint}
        hasProfileUrl={Boolean(person.profile_url)}
        timeZone={timeZone}
        lastResearchedAt={person.last_researched_at}
        // Sources actually standing behind a claim: something rests on them,
        // and they have not been marked as somebody else.
        sourceCount={
          sources.filter((source) => source.factCount > 0 && source.identityStatus !== 'no_match')
            .length
        }
        storedSourceCount={sources.length}
      />

      {hasFootprint || sources.length > 0 ? (
        <details className="group mt-6">
          <summary className="border-line bg-surface text-ink hover:border-line-strong flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
            <span className="flex flex-wrap items-center gap-2">
              <Globe className="text-ink-muted size-4" aria-hidden="true" />
              Public professional footprint
              <span className="text-ink-muted text-xs">
                {pluralise(currentFacts.length, 'fact')} · {pluralise(sources.length, 'source')}
              </span>
            </span>
            <span aria-hidden="true" className="text-ink-muted text-xs group-open:hidden">
              Show
            </span>
            <span aria-hidden="true" className="text-ink-muted hidden text-xs group-open:inline">
              Hide
            </span>
          </summary>

          {hasFootprint ? (
            <div className="mt-6 grid gap-8">
              {FACT_GROUPS.map((group) => {
                const groupFacts = currentFacts.filter((f) => group.kinds.includes(f.kind))
                if (groupFacts.length === 0) return null

                return (
                  <div key={group.label}>
                    <h3 className="text-ink text-sm font-medium">{group.label}</h3>
                    <ul className="mt-3 grid gap-3.5">
                      {groupFacts.map((fact) => (
                        <li key={fact.id} className="flex gap-3">
                          <span
                            aria-hidden="true"
                            className="bg-line-strong mt-2.5 h-px w-3 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-ink text-sm leading-relaxed">
                              {fact.value}
                              {fact.detail ? (
                                <span className="text-ink-muted"> — {fact.detail}</span>
                              ) : null}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <EvidenceBadge level={fact.evidence_level} />
                              <ProvenanceLabel
                                provenance={
                                  fact.evidence_level === 'inferred'
                                    ? 'inference'
                                    : 'public_research'
                                }
                              />
                              {/* Freshness. Phrased as the SOURCE's date, not the
                                  fact's: a page can predate the thing it describes. */}
                              {fact.as_of ? (
                                <span className="text-ink-faint text-xs">
                                  source published {formatPublishedDate(fact.as_of)}
                                </span>
                              ) : (
                                <span className="text-ink-faint text-xs">source gave no date</span>
                              )}
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
            </div>
          ) : null}

          {sources.length > 0 ? (
            <section className="mt-8">
              <Eyebrow>Sources</Eyebrow>
              <p className="text-ink-muted mt-2 max-w-lg text-xs leading-relaxed">
                Everything above that came from public material rests on these. Correct any of them
                — what they alone supported is withdrawn with them.
              </p>
              <ul className="mt-3 grid gap-2">
                {sources.map((source) => (
                  <SourceRow key={source.id} source={source} personId={id} personName={name} />
                ))}
              </ul>
            </section>
          ) : null}
        </details>
      ) : null}

      {/* --- add context -------------------------------------------------------- */}
      <div className="border-line bg-bg-sunken mt-8 rounded-[var(--radius-lg)] border p-5 sm:p-6">
        <AddContext personId={id} personName={person.full_name} />
        <AddDocument personId={id} />
      </div>
    </Container>
  )
}
