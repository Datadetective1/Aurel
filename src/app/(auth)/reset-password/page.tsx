import type { Metadata } from 'next'
import { ResetPasswordForm } from '@/components/auth/password-forms'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
}

export default async function ResetPasswordPage() {
  // Whoever the reset link signed in. Used only to give password managers a
  // username to file the new credential under — see ResetPasswordForm.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Choose a new password</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
        You are signed in from your reset link. Set a new password to finish.
      </p>
      <ResetPasswordForm email={user?.email} />
    </div>
  )
}
