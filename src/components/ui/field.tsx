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
        'text-[0.8125rem] font-medium text-ink-secondary peer-disabled:opacity-50',
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
    return <input ref={ref} className={cn(controlStyles, 'h-10', className)} {...props} />
  },
)

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea ref={ref} className={cn(controlStyles, 'min-h-24 leading-relaxed', className)} {...props} />
    )
  },
)

export const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(controlStyles, 'h-10 appearance-none pr-8', className)}
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
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="ml-1 text-critical" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {description ? (
        <p id={descriptionId} className="text-xs leading-relaxed text-ink-muted">
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
        <p id={errorId} role="alert" className="text-xs text-critical">
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
        'group relative flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-4',
        'transition-colors duration-150 hover:border-line-strong hover:bg-bg-sunken',
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
          'mt-0.5 size-4 shrink-0 appearance-none border border-line-strong bg-surface',
          type === 'radio' ? 'rounded-full' : 'rounded-[3px]',
          'checked:border-accent checked:bg-accent',
          'focus-visible:outline-none',
        )}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{description}</span>
        ) : null}
      </span>
    </label>
  )
}
