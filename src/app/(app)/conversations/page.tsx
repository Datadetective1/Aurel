import Link from 'next/link'
import type { Metadata } from 'next'
import { CircleCheck, Mic, Plus } from 'lucide-react'
import { ConversationCard } from '@/components/app/conversation-card'
import { IllustratedEmpty } from '@/components/app/empty-visual'
import { Button } from '@/components/ui/button'
import { Container, Eyebrow, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { listConversations } from '@/lib/conversations/queries'
import { pluralise } from '@/lib/format'
import { brand } from '@/lib/brand'

export const metadata: Metadata = { title: 'Conversations', robots: { index: false, follow: false } }

/**
 * CONVERSATIONS
 * =============================================================================
 * Everything the user has kept, newest first, with the ones still waiting on
 * a review lifted to the top. A conversation is a card with faces on it, not
 * a row in a log.
 * =============================================================================
 */
export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>
}) {
  const { deleted } = await searchParams
  const { user, profile } = await requireOnboardedUser()
  const timeZone = profile.timezone ?? 'UTC'
  const now = new Date()
  const supabase = await createClient()

  const conversations = await listConversations(supabase, user.id, { limit: 100 })
  const needsReview = conversations.filter(
    (c) => c.processingStatus === 'ready' && c.pendingReview > 0 && !c.reviewedAt,
  )
  const rest = conversations.filter((c) => !needsReview.includes(c))

  return (
    <Container size="default" className="py-8 sm:py-12">
      <SectionHeader
        as="h1"
        eyebrow="Remember"
        title="Conversations"
        description={
          conversations.length > 0
            ? `${pluralise(conversations.length, 'conversation')} kept. ${brand.name} remembers what each one left open.`
            : undefined
        }
        action={
          <Button asChild>
            <Link href="/conversations/new">
              <Mic className="size-4" aria-hidden="true" />
              Add a conversation
            </Link>
          </Button>
        }
      />

      {deleted ? (
        <p
          role="status"
          className="mt-6 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-line bg-bg-sunken px-4 py-3 text-sm text-ink-secondary"
        >
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden="true" />
          Deleted. Anything you had already confirmed from it stays in your record.
        </p>
      ) : null}

      {conversations.length === 0 ? (
        <IllustratedEmpty
          className="mt-10"
          subject="conversation"
          title="Nothing kept yet"
          description={
            <>
              After your next conversation, speak a thirty-second note, paste the transcript, or
              type what happened. {brand.name} pulls out what you promised, what they promised,
              what was decided and what nobody answered, and asks you to confirm before any of it
              becomes memory.
            </>
          }
          action={
            <Button asChild>
              <Link href="/conversations/new">
                <Plus className="size-4" aria-hidden="true" />
                Keep your first conversation
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {needsReview.length > 0 ? (
            <section className="mt-9">
              <div className="flex items-baseline gap-3">
                <Eyebrow className="text-accent">Waiting on you</Eyebrow>
                <span className="text-xs text-ink-faint">{needsReview.length}</span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Read, but not yet confirmed. Nothing from these is in your loops until you say so.
              </p>
              <ul className="mt-4 grid gap-3">
                {needsReview.map((c) => (
                  <ConversationCard key={c.id} conversation={c} timeZone={timeZone} now={now} />
                ))}
              </ul>
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section className="mt-10">
              {needsReview.length > 0 ? <Eyebrow>Everything else</Eyebrow> : null}
              <ul className={needsReview.length > 0 ? 'mt-4 grid gap-3' : 'grid gap-3'}>
                {rest.map((c) => (
                  <ConversationCard key={c.id} conversation={c} timeZone={timeZone} now={now} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <p className="mt-12 max-w-xl text-xs leading-relaxed text-ink-muted">
        Audio is transcribed and then dropped; only the words are kept. Delete any conversation
        and everything it proposed goes with it. What you had already confirmed into a person&rsquo;s
        record stays, because you chose it.
      </p>
    </Container>
  )
}
