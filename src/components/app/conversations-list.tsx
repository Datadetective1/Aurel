import { Info } from 'lucide-react'
import { ConversationCard } from '@/components/app/conversation-card'
import { Eyebrow } from '@/components/ui/primitives'
import type { ConversationSummary } from '@/lib/conversations/queries'

/**
 * The Conversations list: the ones waiting on a review lifted to the top,
 * then everything else. Presentation over props, shared by the page and the
 * visual preview.
 */
export function ConversationsList({
  conversations,
  timeZone,
  now,
}: {
  conversations: ConversationSummary[]
  timeZone: string
  now: Date
}) {
  const needsReview = conversations.filter(
    (c) => c.processingStatus === 'ready' && c.pendingReview > 0 && !c.reviewedAt,
  )
  const rest = conversations.filter((c) => !needsReview.includes(c))

  return (
    <>
      {needsReview.length > 0 ? (
        <section className="mt-6">
          <div className="flex items-baseline gap-3">
            <Eyebrow className="text-accent">Waiting on you</Eyebrow>
            <span className="text-ink-faint text-xs">{needsReview.length}</span>
          </div>
          <ul className="mt-4 grid gap-3">
            {needsReview.map((c) => (
              <ConversationCard key={c.id} conversation={c} timeZone={timeZone} now={now} />
            ))}
          </ul>
        </section>
      ) : null}

      {rest.length > 0 ? (
        <section className="mt-8">
          {needsReview.length > 0 ? <Eyebrow>Everything else</Eyebrow> : null}
          <ul className={needsReview.length > 0 ? 'mt-4 grid gap-3' : 'grid gap-3'}>
            {rest.map((c) => (
              <ConversationCard key={c.id} conversation={c} timeZone={timeZone} now={now} />
            ))}
          </ul>
        </section>
      ) : null}

      <details className="group mt-8">
        <summary className="text-ink-muted hover:text-ink inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-xs [&::-webkit-details-marker]:hidden">
          <Info className="size-3.5" aria-hidden="true" />
          How conversations are kept
        </summary>
        <p className="text-ink-muted max-w-xl text-xs leading-relaxed">
          Audio is transcribed and then dropped; only the words are kept. Delete any conversation
          and everything it proposed goes with it. What you had already confirmed into a
          person&rsquo;s record stays, because you chose it.
        </p>
      </details>
    </>
  )
}
