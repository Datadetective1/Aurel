import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@/components/ui/button'
import { Container, Eyebrow } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'

export const metadata: Metadata = {
  title: 'Not found',
  robots: { index: false, follow: false },
}

/**
 * 404.
 *
 * There was no custom one, so a mistyped URL — or, more likely, a person or
 * meeting that has since been deleted — dropped the user onto Next's default
 * grey screen: no wordmark, no navigation, no way back in except the browser's
 * back button. For a product whose whole argument is that it tells you what it
 * knows and what it does not, an unstyled dead end is a trust event, not a
 * cosmetic one.
 *
 * Deliberately plain. It says which of the two likely things happened, and
 * offers the two routes a person actually wants from here. No illustration, no
 * apology, no "Oops".
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col justify-center">
      <Container size="narrow" className="py-20">
        <Eyebrow>Not found</Eyebrow>
        <h1 className="mt-4 font-display text-3xl leading-tight text-ink sm:text-4xl">
          This page isn&rsquo;t here.
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-secondary">
          The link may be out of date, or the person or meeting it pointed to may have been
          deleted. Nothing in your record has changed.
        </p>

        <div className="mt-8 flex flex-wrap gap-2.5">
          <Button asChild>
            <Link href="/today">Go to Today</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">{brand.name} home</Link>
          </Button>
        </div>
      </Container>
    </div>
  )
}
