import Link from 'next/link'
import type { Metadata } from 'next'
import { MailCheck } from 'lucide-react'
import { brand } from '@/lib/brand'

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false, follow: false },
}

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams

  return (
    <div>
      <MailCheck className="size-6 text-accent" aria-hidden="true" />
      <h1 className="mt-5 font-display text-3xl text-ink">Confirm your email</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
        We sent a confirmation link
        {email ? (
          <>
            {' '}
            to <span className="text-ink">{email}</span>
          </>
        ) : null}
        . Open it and {brand.name} will pick up right where you left off.
      </p>
      <p className="mt-6 text-xs leading-relaxed text-ink-muted">
        Nothing yet? Check your spam folder. Confirmation links expire after 24 hours — you can
        request a new one by signing up again with the same address.
      </p>
      <p className="mt-8 text-sm text-ink-muted">
        <Link href="/sign-in" className="text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
