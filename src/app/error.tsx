'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Container, Eyebrow } from '@/components/ui/primitives'
import { logger } from '@/lib/logger'
import { brand } from '@/lib/brand'

/**
 * Route error boundary.
 *
 * Catches a render or data failure anywhere below the root layout and keeps the
 * user inside the product. Before this existed, an unhandled server error
 * rendered Next's default error screen — which on a product built on evidence
 * and provenance reads as "something is wrong with your data", when usually
 * nothing is.
 *
 * Two things it deliberately does not do:
 *
 *   It does not show the error message. `error.message` can carry a database
 *   constraint, a row id, or a fragment of someone's relationship record, and
 *   this screen is the one place a stack trace most wants to escape to. The
 *   digest is enough to find the real error in the logs.
 *
 *   It does not claim the problem is fixed. `reset()` retries the segment,
 *   which works for a transient failure and does nothing for a persistent one,
 *   so the copy offers it as "try again" rather than a promise.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    // Shape only. Never the message, for the reason above.
    logger.error('app.render_error', { digest: error.digest, name: error.name })
  }, [error])

  return (
    <div className="flex min-h-dvh flex-col justify-center">
      <Container size="narrow" className="py-20">
        <Eyebrow>Something went wrong</Eyebrow>
        <h1 className="font-display text-ink mt-4 text-3xl leading-tight sm:text-4xl">
          This screen didn&rsquo;t load.
        </h1>
        <p className="text-ink-secondary mt-4 max-w-md text-sm leading-relaxed">
          The failure was on our side. Everything you had already saved is safe; anything typed but
          not yet saved on this screen may need entering again. Trying again often works.
        </p>

        <div className="mt-8 flex flex-wrap gap-2.5">
          <Button onClick={reset} className="h-11">
            Try again
          </Button>
          <Button asChild variant="secondary" className="h-11">
            <Link href="/today">Go to Today</Link>
          </Button>
        </div>

        <p className="text-ink-muted mt-8 text-xs leading-relaxed">
          Still broken? Email{' '}
          <a
            href={`mailto:${brand.email.support}${error.digest ? `?subject=Reference%20${error.digest}` : ''}`}
            className="text-accent underline underline-offset-2"
          >
            {brand.email.support}
          </a>
          {error.digest ? (
            <>
              {' '}
              with reference <span className="font-mono">{error.digest}</span>.
            </>
          ) : (
            '.'
          )}
        </p>
      </Container>
    </div>
  )
}
