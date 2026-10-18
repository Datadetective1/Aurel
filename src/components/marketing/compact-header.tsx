'use client'

import * as React from 'react'
import Link from 'next/link'
import { Wordmark } from '@/components/brand/aperture'
import { Button } from '@/components/ui/button'
import { brand } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * COMPACT HEADER (below lg)
 * =============================================================================
 * On a phone the full header scrolls away with the page instead of holding
 * 64px of every screen. Once it is out of view, this slimmer bar takes its
 * place: the wordmark, Sign in and Start free -- the two actions a visitor
 * needs at any point on the page -- each a 44px target.
 *
 * Driven by an IntersectionObserver on a sentinel at the top of the page, not
 * a scroll listener. While hidden it is `inert`, so it can be neither seen
 * nor reached by keyboard. Without JavaScript it simply never appears and the
 * normal header does the job. From lg up the full header is sticky and this
 * bar is not rendered visible at all.
 * =============================================================================
 */
export function CompactHeader() {
  const sentinel = React.useRef<HTMLDivElement>(null)
  const [shown, setShown] = React.useState(false)

  React.useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setShown(!entry!.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <>
      {/* Sits just under the full header: once it leaves the viewport, so has the header. */}
      <div
        ref={sentinel}
        aria-hidden="true"
        className="pointer-events-none absolute top-16 h-px w-px"
      />
      <div
        inert={!shown}
        className={cn(
          'border-line/70 bg-bg/90 fixed inset-x-0 top-0 z-40 border-b backdrop-blur-md transition-transform duration-150 motion-reduce:transition-none lg:hidden',
          shown ? 'translate-y-0' : '-translate-y-full',
        )}
      >
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-5 sm:px-8">
          <Link
            href="/"
            className="text-ink inline-flex min-h-11 items-center rounded-sm"
            aria-label={`${brand.name} home`}
          >
            <Wordmark name={brand.name} className="text-base" />
          </Link>
          <div className="flex items-center gap-1.5">
            <Button asChild variant="ghost" size="sm" className="h-11 px-3">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm" className="h-11 px-4">
              <Link href="/sign-up">Start free</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
