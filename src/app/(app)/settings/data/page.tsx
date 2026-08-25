import type { Metadata } from 'next'
import { Database } from 'lucide-react'
import { DataControls } from '@/components/app/data-controls'
import { SeedDemoButton } from '@/components/app/seed-demo-button'
import { Eyebrow, Panel } from '@/components/ui/primitives'
import { requireOnboardedUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { brand } from '@/lib/brand'

export const metadata: Metadata = {
  title: 'Privacy and data',
  robots: { index: false, follow: false },
}

export default async function DataSettingsPage() {
  const { user, profile } = await requireOnboardedUser()
  const supabase = await createClient()

  const counts = await Promise.all([
    supabase.from('people').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('observations').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('interactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('sources').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const stats = [
    { label: 'People', value: counts[0].count ?? 0 },
    { label: 'Observations', value: counts[1].count ?? 0 },
    { label: 'Interactions', value: counts[2].count ?? 0 },
    { label: 'Sources', value: counts[3].count ?? 0 },
  ]

  return (
    <div>
      <Eyebrow>Privacy and data</Eyebrow>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-secondary">
        Your relationship record belongs to you. Take a copy, or destroy it, without asking anyone.
      </p>

      <Panel className="mt-6 p-5">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-ink-faint" aria-hidden="true" />
          <p className="text-sm font-medium text-ink">What you have stored</p>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="label">{stat.label}</dt>
              <dd className="mt-1 font-display text-2xl tabular-nums text-ink">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <p className="mt-5 max-w-lg text-xs leading-relaxed text-ink-muted">
        Everything above is scoped to your account at the database level. It is not shared with
        anyone, it is not used to train a shared model, and {brand.name} never records or infers
        anyone&rsquo;s protected characteristics.
      </p>

      {!profile.demo_seeded_at ? (
        <div className="mt-8">
          <Eyebrow>Demo data</Eyebrow>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-secondary">
            Load a fictional relationship record — five invented colleagues with real evidence, an
            overdue commitment and a meeting worth preparing for — to see what {brand.name} looks
            like after a few months of use. Removable in one click.
          </p>
          <div className="mt-4">
            <SeedDemoButton />
          </div>
        </div>
      ) : null}

      <div className="mt-9">
        <DataControls hasDemoData={Boolean(profile.demo_seeded_at)} />
      </div>
    </div>
  )
}
