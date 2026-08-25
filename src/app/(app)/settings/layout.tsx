import Link from 'next/link'
import { SettingsNav } from '@/components/app/settings-nav'
import { Container, SectionHeader } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { brand } from '@/lib/brand'

/**
 * Settings shell.
 *
 * Sectioned rather than one continuous scroll: the page had grown to cover
 * profile, appearance, voice, the assessment, plan, capability transparency and
 * destructive data controls, which is too much to scan and puts "delete
 * everything" one flick away from "change your job title".
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireOnboardedUser()

  return (
    <Container size="default" className="py-8 sm:py-12">
      <SectionHeader as="h1" eyebrow="Account" title="Settings" />

      <div className="mt-8 grid gap-8 lg:grid-cols-[13rem_1fr] lg:gap-12">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>

      <p className="mt-16 text-xs text-ink-faint">
        <Link href="/privacy" className="hover:text-ink-muted">
          Privacy
        </Link>{' '}
        ·{' '}
        <Link href="/terms" className="hover:text-ink-muted">
          Terms
        </Link>{' '}
        ·{' '}
        <a href={`mailto:${brand.email.support}`} className="hover:text-ink-muted">
          {brand.email.support}
        </a>
      </p>
    </Container>
  )
}
