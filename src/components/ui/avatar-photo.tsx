'use client'

import { sampleFace } from '@/lib/demo/faces'
import { cn } from '@/lib/utils'

/**
 * The photo layer of an Avatar. It sits over the initials, so while it loads,
 * or if the URL is broken or has expired, the initials underneath are what
 * shows. On an error it hides itself rather than leaving a browser's
 * broken-image box on top of them.
 *
 * An image can fail before the page hydrates, when React is not yet listening
 * for `error`, so the element is also checked as it mounts. `decode()` tells a
 * failed image apart from a valid SVG with no intrinsic size, which also
 * reports a natural width of 0.
 */

function hide(img: HTMLImageElement) {
  img.hidden = true
}

function hideIfBroken(img: HTMLImageElement | null) {
  if (img && img.complete && img.naturalWidth === 0) img.decode().catch(() => hide(img))
}

export function AvatarPhoto({
  src,
  alt,
  priority = false,
  className,
}: {
  src: string
  alt: string
  priority?: boolean
  className?: string
}) {
  src = sampleFace(src)
  // Avatars are arbitrary remote or data URLs supplied per user, so
  // next/image would need a per-user remote allowlist to be configured.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      // Keyed on the URL: a new photo starts visible again.
      key={src}
      ref={hideIfBroken}
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={(event) => hide(event.currentTarget)}
      className={cn(
        // object-position slightly above centre: faces sit in the upper
        // half of most portraits, and a centred crop cuts foreheads.
        'absolute inset-0 size-full rounded-full object-cover object-[50%_35%]',
        className,
      )}
    />
  )
}
