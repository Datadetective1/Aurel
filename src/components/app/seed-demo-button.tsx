'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { loadDemoData } from '@/app/(app)/settings/actions'
import { Button } from '@/components/ui/button'

/** Loads the fictional relationship record. Idempotent and reversible. */
export function SeedDemoButton() {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = async () => {
    setPending(true)
    setError(null)
    const result = await loadDemoData()
    setPending(false)
    if (result.error) setError(result.error)
    else router.push('/today?demo=1')
  }

  return (
    <div>
      <Button variant="secondary" size="sm" onClick={load} disabled={pending}>
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="size-3.5" aria-hidden="true" />
        )}
        Load demo data
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-critical">
          {error}
        </p>
      ) : null}
    </div>
  )
}
