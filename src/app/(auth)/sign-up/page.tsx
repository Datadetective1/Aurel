import Link from 'next/link'
import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/auth-form'
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

      <AuthForm mode="sign-up" className="mt-8" />

      <p className="mt-8 text-sm text-ink-muted">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
