import Link from 'next/link'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/auth-form'
import { Skeleton } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'

export const metadata: Metadata = {
  title: 'Sign in',
  description: `Sign in to ${brand.name}.`,
  robots: { index: false, follow: false },
}

export default function SignInPage() {
  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Welcome back</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
        Pick up where you left off.
      </p>

      <Suspense fallback={<Skeleton className="mt-8 h-64 w-full" />}>
        <AuthForm mode="sign-in" className="mt-8" />
      </Suspense>

      <p className="mt-8 text-sm text-ink-muted">
        New to {brand.name}?{' '}
        <Link href="/sign-up" className="text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  )
}
