import { mobileContext, json } from '@/lib/mobile/route'
import { listLoops } from '@/lib/conversations/queries'
import { PERSON_COLUMNS, toVisualPeople, type PersonRow } from '@/lib/visual/people.server'
import { goingCold, type ColdFact } from '@/lib/visual/going-cold'
import type { GoingColdResponse } from '@/lib/mobile/contracts'

/**
 * Important relationships nobody has touched in weeks, each with a reason to
 * get in touch when the record holds one: that person's latest public news,
 * from sources the user kept. The reason is always labelled Inferred.
 */
export async function GET() {
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const now = new Date()
  const { data } = await ctx.supabase
    .from('people')
    .select(PERSON_COLUMNS)
    .eq('user_id', ctx.user.id)
    .is('archived_at', null)
    .gte('relevance', 4)
    .limit(200)
  const rows = (data ?? []) as PersonRow[]

  const cold = goingCold(
    rows.map((p) => ({
      id: p.id,
      name: p.preferred_name || p.full_name,
      relevance: p.relevance,
      lastInteractionAt: p.last_interaction_at,
      createdAt: p.created_at,
    })),
    [],
    ctx.timeZone,
    now,
  )
  const ids = cold.map((c) => c.personId)
  if (ids.length === 0) return json<GoingColdResponse>({ timeZone: ctx.timeZone, people: [] })

  const [{ data: facts }, loops] = await Promise.all([
    ctx.supabase
      .from('professional_facts')
      .select(
        'person_id, kind, value, detail, evidence_level, first_seen_at, as_of, fact_sources(sources(source_title, source_url, published_at))',
      )
      .eq('user_id', ctx.user.id)
      .in('person_id', ids)
      .eq('is_current', true)
      .in('kind', ['publication', 'appearance', 'current_role', 'current_organization'])
      .in('evidence_level', ['confirmed', 'observed'])
      .limit(200),
    listLoops(ctx.supabase, ctx.user.id, { scope: 'active', timeZone: ctx.timeZone, now }),
  ])

  const coldFacts: ColdFact[] = (facts ?? []).map((f) => {
    const src = f.fact_sources?.find((s) => s.sources)?.sources ?? null
    return {
      personId: f.person_id,
      kind: f.kind,
      value: f.value,
      detail: f.detail,
      evidence: f.evidence_level,
      firstSeenAt: f.first_seen_at,
      asOf: f.as_of,
      source: src
        ? { title: src.source_title, url: src.source_url, publishedAt: src.published_at }
        : null,
    }
  })

  // Read again with the facts: the people list is the same, the reasons fill in.
  const withReasons = goingCold(
    rows
      .filter((p) => ids.includes(p.id))
      .map((p) => ({
        id: p.id,
        name: p.preferred_name || p.full_name,
        relevance: p.relevance,
        lastInteractionAt: p.last_interaction_at,
        createdAt: p.created_at,
      })),
    coldFacts,
    ctx.timeZone,
    now,
  )
  const visual = await toVisualPeople(
    ctx.supabase,
    rows.filter((p) => ids.includes(p.id)),
    loops,
  )

  return json<GoingColdResponse>({
    timeZone: ctx.timeZone,
    people: withReasons.flatMap((c) => {
      const person = visual.get(c.personId)
      return person ? [{ ...c, person }] : []
    }),
  })
}
