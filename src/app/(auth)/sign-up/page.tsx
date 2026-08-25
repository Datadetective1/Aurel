import Link from 'next/link'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/auth-form'
import { Skeleton } from '@/components/ui/primitives'
import { brand } from '@/lib/brand'

export const metadata: Metadata = {
  title: 'Create your account',
  description: `Start building your ${brand.assessmentName} and prepare for the conversations that matter.`,
  robots: { index: false, follow: false },
}

export default function SignUpPage() {
  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Create your account</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
        Build your {brand.assessmentName.toLowerCase()}, add the people who matter, and walk into
        your next meeting prepared.
      </p>

      {/* AuthForm reads useSearchParams to preserve a post-auth destination,
          which requires a Suspense boundary to prerender. */}
      <Suspense fallback={<Skeleton className="mt-8 h-80 w-full" />}>
        <AuthForm mode="sign-up" className="mt-8" />
      </Suspense>

      <p className="mt-8 text-sm text-ink-muted">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-accent underline underline-offset-2 decoration-accent/40 hover:decoration-accent">
          Sign in
        </Link>
      </p>
    </div>
  )
}
