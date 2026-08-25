import type { Metadata } from 'next'
import { ResetPasswordForm } from '@/components/auth/password-forms'

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
}

export default function ResetPasswordPage() {
  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Choose a new password</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
        You are signed in from your reset link. Set a new password to finish.
      </p>
      <ResetPasswordForm />
    </div>
  )
}
