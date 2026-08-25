import { redirect } from 'next/navigation'
import { ArrowRight, Layers, Target, UserRound } from 'lucide-react'
import { ApertureRule } from '@/components/brand/aperture'
import { Button } from '@/components/ui/button'
import { getProfile } from '@/lib/auth'
import { brand } from '@/lib/brand'
import { startOnboarding } from './actions'
import { stepPath, type OnboardingStep } from '@/lib/onboarding'

export const metadata = { title: 'Welcome', robots: { index: false, follow: false } }

const PILLARS = [
  {
    icon: UserRound,
    title: 'Know your defaults',
    body: `Your ${brand.assessmentName} maps how you naturally communicate, decide and handle disagreement — so guidance accounts for your side too.`,
  },
  {
    icon: Layers,
    title: 'Understand the relationship',
    body: 'Build a record of the people you work with: what they ask for, what they have objected to, and what is still open between you.',
  },
  {
    icon: Target,
    title: 'Prepare for the moment',
    body: 'Turn that record into a brief for a specific room and a specific objective, with the evidence behind every recommendation.',
  },
]

export default async function OnboardingWelcomePage() {
  const profile = await getProfile()

  // Resume where they stopped rather than restarting the flow.
  const stage = (profile?.onboarding_stage ?? 'welcome') as OnboardingStep
  if (stage !== 'welcome') redirect(stepPath(stage))

  return (
    <div className="py-6">
      <h1 className="font-display text-4xl leading-tight text-ink sm:text-5xl">
        Walk into the room
        <br />
        knowing what matters.
      </h1>

      <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-secondary">
        The next few minutes set up the two things {brand.name} needs: how you work, and who you
        work with. Nothing here is shared with anyone.
      </p>

      <ApertureRule className="my-10" />

      <ul className="grid gap-8 sm:grid-cols-3">
        {PILLARS.map((pillar) => (
          <li key={pillar.title}>
            <pillar.icon className="size-5 text-accent" aria-hidden="true" />
            <h2 className="mt-4 font-display text-lg text-ink">{pillar.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{pillar.body}</p>
          </li>
        ))}
      </ul>

      <form action={startOnboarding} className="mt-12">
        <Button type="submit" size="lg">
          Build my {brand.assessmentName.toLowerCase()}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </form>

      <p className="mt-4 text-xs text-ink-muted">
        About five minutes. You can stop and come back at any point.
      </p>
    </div>
  )
}
