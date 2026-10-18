'use client'

import * as React from 'react'
import Link from 'next/link'
import { UserRound } from 'lucide-react'
import { snoozeProfilePrompt } from '@/app/(app)/profile-prompt-actions'
import { Button } from '@/components/ui/button'
import { Eyebrow, Panel } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'

/**
 * The deferred half of the Interaction Profile: offered on Today once a brief
 * exists, for an account that skipped it during setup. "Not now" snoozes it for
 * a week, the same as a refinement question.
 */
export function ProfileInvite({ className }: { className?: string }) {
  const [hidden, setHidden] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  if (hidden) return null

  return (
    <Panel className={className}>
      <div className="flex items-start gap-3 p-6 sm:p-7">
        <UserRound className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <Eyebrow>{brand.assessmentName}</Eyebrow>
          <p className="text-ink font-display mt-3 text-lg leading-snug">
            Add your side of the room.
          </p>
          <p className="text-ink-secondary mt-2 text-sm leading-relaxed">
            Six quick workplace situations, about a minute. Briefs then account for how you tend to
            communicate, not only for the people you are meeting.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" className="h-11">
              <Link href="/onboarding/assessment">Answer six questions</Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await snoozeProfilePrompt()
                  if (result.ok) setHidden(true)
                })
              }
            >
              Not now
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  )
}
