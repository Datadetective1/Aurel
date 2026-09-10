'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Camera, CircleAlert, CircleCheck, Loader2, Trash2 } from 'lucide-react'
import { removePersonPhoto, uploadPersonPhoto, type ActionState } from '@/app/(app)/people/actions'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * PHOTO
 * =============================================================================
 * The face on a person's page. Chosen by the user from their own files:
 * Atturel never goes looking for a likeness, so when there is no photo the
 * initials are the honest face and say so.
 *
 * Submits on choose. A second "Save" button after picking a file is a step
 * nobody wants, and the action is cheap to undo.
 * =============================================================================
 */

export function AvatarUpload({
  personId,
  name,
  src,
  className,
}: {
  personId: string
  name: string
  src: string | null
  className?: string
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(uploadPersonPhoto, {})
  const [preview, setPreview] = React.useState<string | null>(null)
  const [removing, setRemoving] = React.useState(false)
  const [removed, setRemoved] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    setRemoved(false)
    setPreview(URL.createObjectURL(file))
    formRef.current?.requestSubmit()
  }

  const remove = async () => {
    setRemoving(true)
    const result = await removePersonPhoto(personId)
    setRemoving(false)
    if (!result.error) {
      setRemoved(true)
      setPreview(null)
    }
  }

  const shown = removed ? null : (preview ?? src)

  return (
    <form ref={formRef} action={formAction} className={cn('flex items-center gap-5', className)}>
      <input type="hidden" name="personId" value={personId} />
      <Avatar name={name} src={shown} size="xl" />
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-10"
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="size-3.5" aria-hidden="true" />
            {shown ? 'Change photo' : 'Add a photo'}
          </Button>
          {shown ? (
            <Button
              type="button"
              variant="quiet"
              size="sm"
              className="min-h-10"
              onClick={remove}
              disabled={removing}
            >
              {removing ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3.5" aria-hidden="true" />
              )}
              Remove
            </Button>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={onPick}
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
        <p className="text-ink-muted mt-2 text-xs leading-relaxed">
          JPEG, PNG or WebP, up to 2 MB. Visible only to you. Without one, their initials stand in.
        </p>
        <Status state={state} />
      </div>
    </form>
  )
}

function Status({ state }: { state: ActionState }) {
  const { pending } = useFormStatus()
  if (pending) {
    return (
      <p className="text-ink-muted mt-2 flex items-center gap-1.5 text-xs" role="status">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Uploading…
      </p>
    )
  }
  if (state.error) {
    return (
      <p className="text-critical mt-2 flex items-center gap-1.5 text-xs" role="alert">
        <CircleAlert className="size-3.5" aria-hidden="true" />
        {state.error}
      </p>
    )
  }
  if (state.message) {
    return (
      <p className="text-positive mt-2 flex items-center gap-1.5 text-xs" role="status">
        <CircleCheck className="size-3.5" aria-hidden="true" />
        {state.message}
      </p>
    )
  }
  return null
}
