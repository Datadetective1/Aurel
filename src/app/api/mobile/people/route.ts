import { mobileContext, json, readJson } from '@/lib/mobile/route'
import { logger } from '@/lib/logger'
import { createPersonCore } from '@/app/(app)/people/actions'
import { resolveFaces } from '@/lib/conversations/avatars'
import { listLoops } from '@/lib/conversations/queries'
import { relationshipLabel } from '@/lib/conversations/room'
import { actionDirection } from '@/lib/visual/relationship-actions'
import type {
  ArchivedPeopleResponse,
  CreatePersonRequest,
  CreatePersonResponse,
  PeopleResponse,
} from '@/lib/mobile/contracts'

type Ctx = Extract<Awaited<ReturnType<typeof mobileContext>>, { ok: true }>

const SUMMARY_COLUMNS =
  'id, full_name, preferred_name, avatar_url, avatar_path, job_title, relationship_type, last_interaction_at, is_demo, organizations(name, domain)'

/**
 * Everyone on record, most recently spoken to first, with faces and what is
 * open. With `?archived=1`, the people removed from the active record instead.
 * With `?q=`, the web's people search over everyone saved, not only the ones
 * this list carries.
 */
export async function GET(request: Request) {
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const params = new URL(request.url).searchParams
  const q = params.get('q')
  if (q !== null) return searchPeople(ctx, q)

  if (params.get('archived') === '1') {
    const { data } = await ctx.supabase
      .from('people')
      .select('id, full_name, preferred_name, archived_at, is_demo, organizations(name)')
      .eq('user_id', ctx.user.id)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
      .limit(500)
    const body: ArchivedPeopleResponse = {
      people: (data ?? []).map((p) => ({
        id: p.id,
        name: p.preferred_name || p.full_name,
        company: p.organizations?.name ?? null,
        archivedAt: p.archived_at ?? '',
        isDemo: p.is_demo,
      })),
    }
    return json(body)
  }

  const { data: people } = await ctx.supabase
    .from('people')
    .select(SUMMARY_COLUMNS)
    .eq('user_id', ctx.user.id)
    .is('archived_at', null)
    .order('last_interaction_at', { ascending: false, nullsFirst: false })
    .limit(300)

  return json(await summaries(ctx, people ?? []))
}

/**
 * SEARCH, the web's: the same `search_everything` function the web's search
 * calls, so the same words find the same people in the same order. People
 * match on name or role; a company that matches brings the people saved
 * there, which on the web is one more tap away.
 *
 * Only the caller's own, active people: the function runs under row-level
 * security, and every person is read back with `user_id` and `archived_at`
 * filters on top. It never reaches public research or anyone else's record.
 */
async function searchPeople(ctx: Ctx, query: string): Promise<Response> {
  const q = query.trim().slice(0, 120)
  if (q.length < 2) return json<PeopleResponse>({ timeZone: ctx.timeZone, people: [] })

  const { data, error } = await ctx.supabase.rpc('search_everything', { q, max_results: 50 })
  if (error) {
    logger.warn('mobile.people_search_failed', { code: error.code })
    return json({ error: 'Search is not available right now.' }, 502)
  }
  const results = (data ?? []) as { entity: string; id: string }[]
  const matched = results.filter((r) => r.entity === 'person').map((r) => r.id)
  const companies = results.filter((r) => r.entity === 'organization').map((r) => r.id)

  const { data: atCompanies } = companies.length
    ? await ctx.supabase
        .from('people')
        .select('id')
        .eq('user_id', ctx.user.id)
        .is('archived_at', null)
        .in('organization_id', companies)
        .order('last_interaction_at', { ascending: false, nullsFirst: false })
        .limit(50)
    : { data: [] as { id: string }[] }

  const ids = [...new Set([...matched, ...(atCompanies ?? []).map((p) => p.id)])].slice(0, 50)
  if (ids.length === 0) return json<PeopleResponse>({ timeZone: ctx.timeZone, people: [] })

  const { data: people } = await ctx.supabase
    .from('people')
    .select(SUMMARY_COLUMNS)
    .eq('user_id', ctx.user.id)
    .is('archived_at', null)
    .in('id', ids)
  const rank = new Map(ids.map((id, i) => [id, i]))
  const ordered = (people ?? []).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
  return json(await summaries(ctx, ordered))
}

type SummaryRow = {
  id: string
  full_name: string
  preferred_name: string | null
  avatar_url: string | null
  avatar_path: string | null
  job_title: string | null
  relationship_type: string
  last_interaction_at: string | null
  is_demo: boolean
  organizations: { name: string; domain: string | null } | null
}

/** Faces, place and what is open, the same for the list and for search. */
async function summaries(ctx: Ctx, people: SummaryRow[]): Promise<PeopleResponse> {
  const [loops, faces] = await Promise.all([
    listLoops(ctx.supabase, ctx.user.id, { scope: 'active', timeZone: ctx.timeZone }),
    resolveFaces(ctx.supabase, people, (p) => p.id),
  ])

  return {
    timeZone: ctx.timeZone,
    people: people.map((p) => {
      const mine = loops.filter((l) => l.personId === p.id)
      const label = relationshipLabel(p.relationship_type)
      return {
        id: p.id,
        name: p.preferred_name || p.full_name,
        fullName: p.full_name,
        src: faces.get(p.id) ?? null,
        title: p.job_title,
        company: p.organizations?.name ?? null,
        companyDomain: p.organizations?.domain ?? null,
        context: label,
        relationshipLabel: label,
        lastInteractionAt: p.last_interaction_at,
        openLoops: mine.length,
        owe: mine.filter((l) => actionDirection(l) === 'owe').length,
        isDemo: p.is_demo,
      }
    }),
  }
}

/**
 * Add someone from the phone -- typically while setting up a meeting with a
 * person not yet on record. The web's creation path: the plan's people limit,
 * the duplicate check and organisation matching all apply. Research is not
 * started here, whatever was entered -- a profile link included. It stays a
 * deliberate step on the person's page (`/api/mobile/people/:id/research`).
 */
export async function POST(request: Request) {
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const body = await readJson<CreatePersonRequest>(request)
  if (!body) {
    return json<CreatePersonResponse>({ ok: false, error: 'That request could not be read.' }, 400)
  }

  const form = new FormData()
  form.set('fullName', String(body.fullName ?? ''))
  const optional = [
    'jobTitle',
    'organizationName',
    'preferredName',
    'email',
    'profileUrl',
    'relationshipType',
    'pronouns',
    'timezone',
    'notes',
  ] as const
  for (const key of optional) if (body[key]) form.set(key, String(body[key]))
  if (body.confirmDuplicate === true) form.set('confirmDuplicate', 'yes')

  // The duplicate check only for apps that ask for it: an older build would
  // read a stop as a failure.
  const result = await createPersonCore(form, { checkDuplicate: body.checkDuplicate === true })
  if (result.duplicate) {
    return json<CreatePersonResponse>(
      {
        ok: false,
        error: `You already have ${result.duplicate.name}.`,
        duplicate: result.duplicate,
      },
      409,
    )
  }
  if (!result.personId) {
    const first = Object.values(result.fieldErrors ?? {})[0]?.[0]
    return json<CreatePersonResponse>(
      {
        ok: false,
        error: result.error ?? first ?? 'We could not add that person.',
        fieldErrors: result.fieldErrors,
      },
      result.fieldErrors ? 400 : 422,
    )
  }
  return json<CreatePersonResponse>({ ok: true, personId: result.personId }, 201)
}
