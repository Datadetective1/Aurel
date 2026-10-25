'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/utils'

/** Form label. Always paired with a control via htmlFor. */
export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(function Label({ className, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        'text-ink-secondary text-[0.8125rem] font-medium peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
})

const controlStyles = [
  'w-full rounded-[var(--radius-md)] border border-line-strong bg-surface',
  'px-3 py-2 text-sm text-ink placeholder:text-ink-faint',
  'transition-colors duration-150',
  'hover:border-ink-faint',
  'focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-[var(--focus-ring)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-[invalid=true]:border-critical',
]

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  function Input({ className, ...props }, ref) {
    // 44px, the minimum tap target, at every width: tablets are touch devices
    // too, and a breakpoint cannot tell a pointer from a finger.
    return <input ref={ref} className={cn(controlStyles, 'h-11', className)} {...props} />
  },
)

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(controlStyles, 'min-h-24 leading-relaxed', className)}
        {...props}
      />
    )
  },
)

/**
 * React resets a form after its action succeeds. An input or textarea keeps
 * what React rendered, because its default follows its value; a select does
 * not, and falls back to its first option or to the one it was mounted with,
 * while the page still believes it shows what was just saved. Saving again
 * would quietly write that back: a person's time zone becomes "Not set", the
 * user's own becomes the first city in the list. So after a reset, the select
 * is put back to what React last rendered. One without a value or a default
 * resets as the browser does.
 */
export const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  function Select({ className, children, ...props }, ref) {
    const node = React.useRef<HTMLSelectElement>(null)
    React.useImperativeHandle(ref, () => node.current as HTMLSelectElement, [])

    const rendered = props.value ?? props.defaultValue
    const latest = React.useRef(rendered)
    // A layout effect, so a reset in the commit that brings new values (the
    // saved ones) is restored to those, not to the previous render's.
    React.useLayoutEffect(() => {
      latest.current = rendered
    })

    React.useEffect(() => {
      const select = node.current
      const form = select?.form
      if (!select || !form) return
      // The event fires before the reset happens; restore once it has.
      const restore = () =>
        setTimeout(() => {
          const value = latest.current
          if (value != null && !Array.isArray(value)) select.value = String(value)
        })
      form.addEventListener('reset', restore)
      return () => form.removeEventListener('reset', restore)
    }, [])

    return (
      <select
        ref={node}
        className={cn(controlStyles, 'h-11 appearance-none pr-8', className)}
        {...props}
      >
        {children}
      </select>
    )
  },
)

/**
 * Labelled form row with description and error text wired for screen readers.
 * Using this everywhere is what keeps forms accessible by default rather than
 * by remembering.
 */
export function FormField({
  id,
  label,
  description,
  error,
  required,
  children,
  className,
}: {
  id: string
  label: string
  description?: string
  error?: string | null
  required?: boolean
  children: (props: {
    id: string
    'aria-describedby': string | undefined
    'aria-invalid': true | undefined
    required: true | undefined
  }) => React.ReactNode
  className?: string
}) {
  const descriptionId = description ? `${id}-description` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined

  return (
    // content-start keeps label and control packed at the top. Without it a
    // field sharing a grid row with a taller neighbour stretches, and its input
    // drifts away from its own label.
    <div className={cn('grid content-start gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-critical ml-1" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {description ? (
        <p id={descriptionId} className="text-ink-muted text-xs leading-relaxed">
          {description}
        </p>
      ) : null}
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required: required || undefined,
      })}
      {error ? (
        <p id={errorId} role="alert" className="text-critical text-xs">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Selectable option card used throughout onboarding. Renders a real radio or
 * checkbox underneath so keyboard navigation, grouping and screen-reader
 * semantics come from the platform rather than from ARIA guesswork.
 */
export function OptionCard({
  type,
  name,
  value,
  checked,
  defaultChecked,
  onChange,
  title,
  description,
  className,
}: {
  type: 'radio' | 'checkbox'
  name: string
  value: string
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  title: string
  description?: string
  className?: string
}) {
  return (
    <label
      className={cn(
        'group border-line bg-surface relative flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-4',
        'hover:border-line-strong hover:bg-bg-sunken transition-colors duration-150',
        'has-[:checked]:border-accent has-[:checked]:bg-accent-wash',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]',
        className,
      )}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={(e) => onChange?.(e.currentTarget.checked)}
        className={cn(
          'border-line-strong bg-surface mt-0.5 size-4 shrink-0 appearance-none border',
          type === 'radio' ? 'rounded-full' : 'rounded-[3px]',
          'checked:border-accent checked:bg-accent',
          'focus-visible:outline-none',
        )}
      />
      <span className="min-w-0">
        <span className="text-ink block text-sm font-medium">{title}</span>
        {description ? (
          <span className="text-ink-muted mt-0.5 block text-xs leading-relaxed">{description}</span>
        ) : null}
      </span>
    </label>
  )
}
