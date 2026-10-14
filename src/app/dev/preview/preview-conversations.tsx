import { ConversationsList } from '@/components/app/conversations-list'
import type { ConversationSummary } from '@/lib/conversations/queries'

/** The Conversations page's list, exactly as the page renders it. */
export function ConversationsListView(props: {
  conversations: ConversationSummary[]
  timeZone: string
  now: Date
}) {
  return (
    <div className="mt-8">
      <ConversationsList {...props} />
    </div>
  )
}
