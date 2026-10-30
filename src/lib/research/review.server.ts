import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { ResearchFact, ResearchResponse, ResearchSource } from '@/lib/mobile/contracts'
import { readHeld } from './ingest'
import { buildProfile } from './profile'
import { researchCapability } from './providers'
import { offersPhoto, sourceImageUrl } from './source-images'
import {
  dropDuplicatePages,
  factLabel,
  hostOf,
  matchStrength,
  nameExcerpt,
  reviewReason,
  reviewState,
  updatedDate,
  type ReviewState,
} from './review'

type Client = SupabaseClient<Database>

const ORDER: Record<ReviewState, number> = { waiting: 0, kept: 1, rejected: 2 }

/**
 * One person's public research, as the app reviews it: every page research
 * found for them, what it would add or already added, and why it may be them.
 *
 * Only the caller's own rows, filtered by `user_id` on top of row-level
 * security, so a shared workspace could never widen it. Only pages from the
 * web (a source URL): notes and documents the user added are their own
 * record, not a public footprint. Null for a person who is not on record or
 * has been archived.
 */
export async function loadResearchReview(
  supabase: Client,
  userId: string,
  personId: string,
): Promise<ResearchResponse | null> {
  const { data: person } = await supabase
    .from('people')
    .select(
      'id, full_name, preferred_name, job_title, profile_url, last_researched_at, avatar_path, avatar_url, organizations(name)',
    )
    .eq('user_id', userId)
    .eq('id', personId)
    .is('archived_at', null)
    .maybeSingle()
  if (!person) return null

  const { data: links } = await supabase
    .from('source_person_links')
    .select(
      'identity_match_status, identity_match_confidence, match_signals, reviewed_by_user, sources(id, source_title, source_url, source_type, publisher, published_at, retrieved_at, access_status, metadata)',
    )
    .eq('user_id', userId)
    .eq('person_id', personId)

  const rows = (links ?? []).flatMap((link) => {
    const src = link.sources
    if (!src?.source_url) return []
    const state = reviewState({
      status: link.identity_match_status,
      reviewed: link.reviewed_by_user,
      accessStatus: src.access_status,
    })
    return [{ link, src, state }]
  })
  const shown = rows.flatMap((r) => (r.state ? [{ ...r, state: r.state }] : []))
  const keptIds = shown.filter((r) => r.state === 'kept').map((r) => r.src.id)
  const readIds = shown.filter((r) => r.state !== 'rejected').map((r) => r.src.id)

  const [{ data: factLinks }, { data: observationLinks }, { data: texts }] = await Promise.all([
    keptIds.length
      ? supabase
          .from('fact_sources')
          .select('source_id, fact_id, excerpt')
          .eq('user_id', userId)
          .in('source_id', keptIds)
      : Promise.resolve({
          data: [] as { source_id: string; fact_id: string; excerpt: string | null }[],
        }),
    keptIds.length
      ? supabase
          .from('observation_sources')
          .select('source_id, observations(person_id)')
          .eq('user_id', userId)
          .in('source_id', keptIds)
      : Promise.resolve({
          data: [] as { source_id: string | null; observations: { person_id: string } | null }[],
        }),
    readIds.length
      ? supabase
          .from('sources')
          .select('id, extracted_text')
          .eq('user_id', userId)
          .in('id', readIds)
      : Promise.resolve({ data: [] as { id: string; extracted_text: string | null }[] }),
  ])

  // A page can stand behind facts about several people; only this person's.
  const factIds = [...new Set((factLinks ?? []).map((f) => f.fact_id))]
  const { data: facts } = factIds.length
    ? await supabase
        .from('professional_facts')
        .select('id, kind, value, detail, evidence_level, is_current')
        .eq('user_id', userId)
        .eq('person_id', personId)
        .in('id', factIds)
    : { data: [] }
  const factById = new Map((facts ?? []).map((f) => [f.id, f]))
  const textById = new Map((texts ?? []).map((t) => [t.id, t.extracted_text]))

  const subject = {
    fullName: person.full_name,
    organization: person.organizations?.name ?? null,
    jobTitle: person.job_title,
  }

  const now = new Date()
  const pages = shown.map(({ link, src, state }) => {
    const held = state === 'waiting' ? readHeld(link.match_signals) : null
    const onRecord: ResearchFact[] =
      state === 'kept'
        ? (factLinks ?? []).flatMap((fl) => {
            const fact = fl.source_id === src.id ? factById.get(fl.fact_id) : undefined
            return fact
              ? [
                  {
                    id: fact.id,
                    kind: fact.kind,
                    label: factLabel(fact.kind),
                    value: fact.value,
                    detail: fact.detail,
                    evidence: fact.evidence_level,
                    excerpt: fl.excerpt,
                    current: fact.is_current,
                  },
                ]
              : []
          })
        : []
    const wouldAdd: ResearchFact[] = (held?.facts ?? []).map((fact, i) => ({
      id: `${src.id}:${i}`,
      kind: fact.kind,
      label: factLabel(fact.kind),
      value: fact.value,
      detail: fact.detail,
      evidence: fact.evidenceLevel,
      excerpt: fact.excerpt,
      current: fact.isCurrent,
    }))
    const proposals =
      state === 'waiting'
        ? (held?.observations.length ?? 0)
        : state === 'kept'
          ? (observationLinks ?? []).filter(
              (o) => o.source_id === src.id && o.observations?.person_id === personId,
            ).length
          : 0
    const text = textById.get(src.id) ?? null
    return {
      id: src.id,
      title: src.source_title || hostOf(src.source_url) || 'A page',
      url: src.source_url,
      host: hostOf(src.source_url),
      publisher: src.publisher,
      publishedAt: src.published_at,
      updatedAt: updatedDate(text, src.published_at, now),
      state,
      match:
        state === 'waiting' ? matchStrength(Number(link.identity_match_confidence ?? 0)) : null,
      why: reviewReason(subject, {
        state,
        reviewed: link.reviewed_by_user,
        signals: link.match_signals,
      }),
      nameExcerpt:
        state === 'waiting'
          ? nameExcerpt(text, person.full_name, { title: src.source_title })
          : null,
      reviewed: link.reviewed_by_user,
      facts: state === 'waiting' ? wouldAdd : onRecord,
      proposals,
      image: sourceImageUrl(src.metadata) !== null,
      offerPhoto: offersPhoto({
        state,
        reviewed: link.reviewed_by_user,
        sourceType: src.source_type,
        metadata: src.metadata,
        personId,
        personHasPhoto: Boolean(person.avatar_path || person.avatar_url),
      }),
      confidence: Number(link.identity_match_confidence ?? 0),
      retrievedAt: src.retrieved_at ?? '',
    }
  })

  // Newest first: a 2020 article is context, today's page is news.
  const dateOf = (page: { updatedAt: string | null; publishedAt: string | null }) =>
    page.updatedAt ?? page.publishedAt ?? ''
  const unique = dropDuplicatePages(pages).sort(
    (a, b) =>
      ORDER[a.state] - ORDER[b.state] ||
      dateOf(b).localeCompare(dateOf(a)) ||
      b.confidence - a.confidence ||
      b.retrievedAt.localeCompare(a.retrievedAt),
  )
  const sources: ResearchSource[] = unique.map(
    ({ confidence: _c, retrievedAt: _r, ...source }) => source,
  )
  const profile = buildProfile(
    unique.map((page) => ({
      id: page.id,
      state: page.state,
      date: dateOf(page) || null,
      facts: page.facts,
    })),
  )

  const capability = researchCapability()
  return {
    person: {
      id: person.id,
      name: person.preferred_name || person.full_name,
      fullName: person.full_name,
      organization: person.organizations?.name ?? null,
      jobTitle: person.job_title,
      hasProfileUrl: Boolean(person.profile_url),
    },
    canDiscover: capability.canDiscover,
    hint: capability.discoveryHint,
    lastResearchedAt: person.last_researched_at,
    sources,
    profile,
    notUsed: rows.length - shown.length,
  }
}
