import Link from 'next/link'
import type { Metadata } from 'next'
import { ForgotPasswordForm } from '@/components/auth/password-forms'

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
}

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Reset your password</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
        Enter your email and we will send you a link to set a new one.
      </p>
      <ForgotPasswordForm />
      <p className="mt-8 text-sm text-ink-muted">
        <Link href="/sign-in" className="text-accent underline underline-offset-2 decoration-accent/40 hover:decoration-accent">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
