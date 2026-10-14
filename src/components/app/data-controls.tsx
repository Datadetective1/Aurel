'use client'

import * as React from 'react'
import { CircleAlert, Download, Loader2, Trash2 } from 'lucide-react'
import {
  clearDemoData,
  deleteAccount,
  exportMyData,
  type SettingsState,
} from '@/app/(app)/settings/actions'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { brand } from '@/lib/brand'

/**
 * Data rights controls.
 *
 * Export, clear demo data, delete account. Deletion is deliberately awkward —
 * typed confirmation, explicit consequences — because it is irreversible and
 * destroys a record the user may have spent months building.
 */
export function DataControls({ hasDemoData }: { hasDemoData: boolean }) {
  const [exporting, setExporting] = React.useState(false)
  const [exportError, setExportError] = React.useState<string | null>(null)
  const [clearing, setClearing] = React.useState(false)
  const [clearMessage, setClearMessage] = React.useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  const download = async () => {
    setExporting(true)
    setExportError(null)
    const result = await exportMyData()
    setExporting(false)

    if (!result.ok) {
      setExportError(result.error)
      return
    }

    // Build the file client-side so the export never transits a public URL.
    const blob = new Blob([result.json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${brand.slug}-export-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const clear = async () => {
    setClearing(true)
    const result = await clearDemoData()
    setClearing(false)
    setClearMessage(result.message ?? result.error ?? null)
  }

  return (
    <div className="grid gap-4">
      {/* Export */}
      <div className="border-line bg-surface flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-ink text-sm">Export everything</p>
          <p className="text-ink-muted mt-0.5 text-xs leading-relaxed">
            Every person, observation, interaction, source and generation, as JSON.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={download} disabled={exporting}>
          {exporting ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-3.5" aria-hidden="true" />
          )}
          Export
        </Button>
      </div>

      {exportError ? (
        <p role="alert" className="text-critical text-xs">
          {exportError}
        </p>
      ) : null}

      {/* Demo data */}
      {hasDemoData ? (
        <div className="border-line bg-surface flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-ink text-sm">Remove demo data</p>
            <p className="text-ink-muted mt-0.5 text-xs leading-relaxed">
              Deletes the sample people and meetings. Anything you added yourself is untouched.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={clear} disabled={clearing}>
            {clearing ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            Remove
          </Button>
        </div>
      ) : null}

      {clearMessage ? (
        <p role="status" className="text-ink-muted text-xs">
          {clearMessage}
        </p>
      ) : null}

      {/* Delete account */}
      <div className="border-critical/25 bg-critical-wash rounded-[var(--radius-md)] border px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-ink text-sm">Delete your account</p>
            <p className="text-ink-secondary mt-0.5 text-xs leading-relaxed">
              Permanently destroys your relationship record. This cannot be undone.
            </p>
          </div>
          {!confirmingDelete ? (
            <Button variant="danger" size="sm" onClick={() => setConfirmingDelete(true)}>
              <Trash2 className="size-3.5" aria-hidden="true" />
              Delete
            </Button>
          ) : null}
        </div>

        {confirmingDelete ? <DeleteForm onCancel={() => setConfirmingDelete(false)} /> : null}
      </div>
    </div>
  )
}

function DeleteForm({ onCancel }: { onCancel: () => void }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(deleteAccount, {})

  return (
    <form action={formAction} className="border-critical/20 mt-5 border-t pt-4">
      <p className="text-ink-secondary flex items-start gap-2 text-xs leading-relaxed">
        <CircleAlert className="text-critical mt-px size-3.5 shrink-0" aria-hidden="true" />
        <span>
          This deletes every person, observation, interaction, note, commitment, source and
          generation in your account, along with your {brand.assessmentName.toLowerCase()}. A paid
          plan is cancelled first, immediately, and you will not be charged again. Export first if
          you want a copy.
        </span>
      </p>

      <label htmlFor="delete-confirm" className="text-ink-secondary mt-4 block text-xs">
        Type <span className="text-ink font-medium">DELETE</span> to confirm
      </label>
      <Input
        id="delete-confirm"
        name="confirmation"
        autoComplete="off"
        placeholder="DELETE"
        className="mt-2 max-w-48"
      />

      {state.error ? (
        <p role="alert" className="text-critical mt-3 text-xs">
          {state.error}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <DeleteSubmit />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function DeleteSubmit() {
  return (
    <Button type="submit" variant="danger" size="sm">
      <Trash2 className="size-3.5" aria-hidden="true" />
      Permanently delete
    </Button>
  )
}
