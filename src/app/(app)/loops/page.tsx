import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Mic } from 'lucide-react'
import { AddLoop } from '@/components/app/add-loop'
import { IllustratedEmpty } from '@/components/app/empty-visual'
import { LoopList } from '@/components/app/loop-list'
import { Button } from '@/components/ui/button'
import { Container, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { listLoops } from '@/lib/conversations/queries'
import { isOverdueIn } from '@/lib/tz'
import { brand } from '@/lib/brand'

export const metadata: Metadata = { title: 'Open loops', robots: { index: false, follow: false } }

/**
 * OPEN LOOPS
 * =============================================================================
 * The signature promise on one page: it remembers the things you say you'll
 * do. Grouped by who owes what, faces on every row, three taps to close.
 *
 * Not a task manager. No projects, no priorities, no drag-and-drop. If a
 * feature request would make this look like one, the answer is no.
 * =============================================================================
 */
export default async function LoopsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>
}) {
  const { show } = await searchParams
  const { user, profile } = await requireOnboardedUser()
  const timeZone = profile.timezone ?? 'UTC'
  const now = new Date()
  const supabase = await createClient()

  const [active, all, { data: people }] = await Promise.all([
    listLoops(supabase, user.id, { timeZone, now, scope: 'active' }),
    show === 'all' ? listLoops(supabase, user.id, { timeZone, now, scope: 'all' }) : Promise.resolve([]),
    supabase
      .from('people')
      .select('id, full_name, preferred_name')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('full_name')
      .limit(200),
  ])

  const overdue = active.filter((l) => l.status === 'open' && isOverdueIn(l.dueOn, timeZone, now))
  const closedOrDeferred = all.filter((l) => !active.some((a) => a.id === l.id))
  const peopleOptions = (people ?? []).map((p) => ({ id: p.id, name: p.preferred_name || p.full_name }))

  return (
    <Container size="default" className="py-8 sm:py-12">
      <SectionHeader
        as="h1"
        eyebrow="Follow through"
        title="Open loops"
        description={
          active.length === 0
            ? undefined
            : overdue.length > 0
              ? `${active.length} open, ${overdue.length} past due. ${brand.name} remembers the things you say you'll do.`
              : `${active.length} open, nothing past due.`
        }
        action={<AddLoop people={peopleOptions} />}
      />

      {active.length === 0 ? (
        <IllustratedEmpty
          className="mt-10"
          subject="loops"
          title="Nothing open"
          description={
            <>
              When you keep a conversation, {brand.name} pulls out what you promised, what they
              promised, and what nobody answered. Confirm them and they live here until you close
              them — with one tap.
            </>
          }
          action={
            <Button asChild>
              <Link href="/conversations/new">
                <Mic className="size-4" aria-hidden="true" />
                Keep a conversation
              </Link>
            </Button>
          }
        />
      ) : (
        <LoopList className="mt-9" loops={active} timeZone={timeZone} now={now} />
      )}

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-line pt-5 text-xs text-ink-muted">
        {show === 'all' ? (
          <>
            <span>Showing everything, including done, cancelled and set aside.</span>
            <Link href="/loops" className="text-ink underline-offset-4 hover:underline">
              Just what is open
            </Link>
          </>
        ) : (
          <Link href="/loops?show=all" className="inline-flex items-center gap-1 text-ink underline-offset-4 hover:underline">
            Show closed and set-aside loops
            <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        )}
      </div>

      {show === 'all' && closedOrDeferred.length > 0 ? (
        <LoopList className="mt-6" loops={closedOrDeferred} timeZone={timeZone} now={now} grouped={false} />
      ) : null}
    </Container>
  )
}
