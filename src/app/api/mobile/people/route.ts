import { mobileContext, json, readJson } from '@/lib/mobile/route'
import { createPersonCore } from '@/app/(app)/people/actions'
import { resolveFaces } from '@/lib/conversations/avatars'
import { listLoops } from '@/lib/conversations/queries'
import { relationshipLabel } from '@/lib/conversations/room'
import { actionDirection } from '@/lib/visual/relationship-actions'
import type {
  CreatePersonRequest,
  CreatePersonResponse,
  PeopleResponse,
} from '@/lib/mobile/contracts'

/** Everyone on record, most recently spoken to first, with faces and what is open. */
export async function GET() {
  const ctx = await mobileContext()
  if (!ctx.ok) return ctx.response

  const [{ data: people }, loops] = await Promise.all([
    ctx.supabase
      .from('people')
      .select(
        'id, full_name, preferred_name, avatar_url, avatar_path, job_title, relationship_type, last_interaction_at, is_demo, organizations(name, domain)',
      )
      .eq('user_id', ctx.user.id)
      .is('archived_at', null)
      .order('last_interaction_at', { ascending: false, nullsFirst: false })
      .limit(300),
    listLoops(ctx.supabase, ctx.user.id, { scope: 'active', timeZone: ctx.timeZone }),
  ])

  const faces = await resolveFaces(ctx.supabase, people ?? [], (p) => p.id)

  const body: PeopleResponse = {
    timeZone: ctx.timeZone,
    people: (people ?? []).map((p) => {
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
  return json(body)
}

/**
 * Add someone from the phone -- typically while setting up a meeting with a
 * person not yet on record. The web's creation path: the plan's people limit,
 * the duplicate check and organisation matching all apply. Research is not
 * started here; it stays a deliberate step on the person's page on the web.
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
  if (body.jobTitle) form.set('jobTitle', String(body.jobTitle))
  if (body.organizationName) form.set('organizationName', String(body.organizationName))

  const result = await createPersonCore(form)
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
