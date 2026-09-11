'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2 } from 'lucide-react'
import { uploadPersonPhoto } from '@/app/(app)/people/actions'
import { Avatar, type AvatarSize } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

/**
 * PORTRAIT
 * =============================================================================
 * A person's face, at any size, with the one affordance that makes photos a
 * system rather than a feature: where there is no photo, "Add photo" is
 * right there, on the face, and it submits on choose. No edit form, no
 * second screen, no save button.
 *
 * Reuses the same secure upload the edit page uses: private bucket, owner
 * folder, signed at render. The photo is the user's to supply; nothing here
 * goes looking for one.
 * =============================================================================
 */

const LABEL_SIZE: Record<AvatarSize, string> = {
  xs: 'hidden',
  sm: 'hidden',
  md: 'size-5 text-[0.5rem]',
  lg: 'h-6 px-1.5 text-[0.625rem]',
  xl: 'h-7 px-2 text-[0.6875rem]',
  '2xl': 'h-7 px-2.5 text-xs',
  '3xl': 'h-8 px-3 text-xs',
}

export function Portrait({
  personId,
  name,
  src,
  size = 'md',
  /** Offer "Add photo" when there is no photo. Off in dense lists. */
  addable = false,
  /** Always show the affordance, not only on hover: for heroes on touch screens. */
  persistent = false,
  className,
}: {
  personId: string
  name: string
  src: string | null | undefined
  size?: AvatarSize
  addable?: boolean
  persistent?: boolean
  className?: string
}) {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [pending, setPending] = React.useState(false)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  const shown = preview ?? src ?? null
  const offer = addable && !shown

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setError(null)
    setPreview(URL.createObjectURL(file))
    setPending(true)
    const body = new FormData()
    body.set('personId', personId)
    body.set('photo', file)
    const result = await uploadPersonPhoto({}, body)
    setPending(false)
    if (result.error) {
      setError(result.error)
      setPreview(null)
    } else {
      router.refresh()
    }
  }

  if (!offer) {
    return <Avatar name={name} src={shown} size={size} className={className} />
  }

  const labelClass = LABEL_SIZE[size]
  const compact = size === 'md'

  return (
    <span className={cn('group relative inline-block shrink-0', className)}>
      <Avatar name={name} src={null} size={size} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        aria-label={`Add a photo of ${name}`}
        title="Add photo"
        className={cn(
          'border-line bg-surface text-ink-secondary hover:text-ink absolute -right-0.5 -bottom-0.5 inline-flex items-center justify-center gap-1 rounded-full border font-medium shadow-[0_1px_2px_rgb(26_24_21/0.08)] transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
          labelClass,
          persistent
            ? 'opacity-100'
            : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
        )}
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        ) : (
          <Camera className="size-3" aria-hidden="true" />
        )}
        {compact ? null : <span>Add photo</span>}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onPick}
      />
      {error ? (
        <span role="alert" className="sr-only">
          {error}
        </span>
      ) : null}
    </span>
  )
}
