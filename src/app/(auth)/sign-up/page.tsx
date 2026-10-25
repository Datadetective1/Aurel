import Link from 'next/link'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/auth-form'
import { Skeleton } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'
import { safeRedirectPath } from '@/lib/safe-redirect'

export const metadata: Metadata = {
  title: 'Create your account',
  description: `Start building your ${brand.assessmentName} and prepare for the conversations that matter.`,
  robots: { index: false, follow: false },
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  // Someone who already has an account keeps where they were heading -- the
  // pricing page's trial button asks for Settings › Plan -- through Sign in.
  const { next } = await searchParams
  const destination = next ? safeRedirectPath(next, '') : ''
  const signIn = destination ? `/sign-in?next=${encodeURIComponent(destination)}` : '/sign-in'
  return (
    <div>
      <h1 className="font-display text-ink text-3xl">Create your account</h1>
      <p className="text-ink-secondary mt-3 text-sm leading-relaxed">
        Build your {brand.assessmentName.toLowerCase()}, add the people who matter, and walk into
        your next meeting prepared.
      </p>

      {/* AuthForm reads useSearchParams to preserve a post-auth destination,
          which requires a Suspense boundary to prerender. */}
      <Suspense fallback={<Skeleton className="mt-8 h-80 w-full" />}>
        <AuthForm mode="sign-up" className="mt-8" />
      </Suspense>

      <p className="text-ink-muted mt-8 text-sm">
        Already have an account?{' '}
        <Link
          href={signIn}
          className="text-accent decoration-accent/40 hover:decoration-accent underline underline-offset-2"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
