import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Button.
 *
 * The primary action is high-contrast INK, not brass. Brass is reserved for
 * markers, focus and the motif — spending it on every button is what makes an
 * accent look cheap. `accent` exists for the single most important conversion
 * moment on a page and should be rare.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium tracking-[-0.005em]',
    'transition-[background-color,color,border-color,opacity] duration-200 ease-[var(--ease-out-quint)]',
    'disabled:pointer-events-none disabled:opacity-45',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-surface-inverse text-ink-inverse hover:opacity-88',
        accent: 'bg-accent text-accent-contrast hover:bg-accent-strong',
        secondary: 'border border-line-strong bg-surface text-ink hover:bg-bg-sunken',
        ghost: 'text-ink-secondary hover:bg-bg-sunken hover:text-ink',
        quiet: 'text-ink-muted hover:text-ink',
        danger: 'border border-critical/30 bg-critical-wash text-critical hover:bg-critical/15',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 rounded-[var(--radius-sm)] px-3 text-[0.8125rem]',
        md: 'h-10 rounded-[var(--radius-md)] px-4 text-sm',
        lg: 'h-12 rounded-[var(--radius-md)] px-6 text-[0.9375rem]',
        // Minimum 44px touch target on the icon variants used in mobile chrome.
        icon: 'size-10 rounded-[var(--radius-md)]',
        'icon-sm': 'size-8 rounded-[var(--radius-sm)]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      // Defaulting to "button" prevents the classic accidental form submit.
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
})

export { buttonVariants }
