import { isRestrictedPhotoHost } from '@/lib/photos/candidates'
import type { ReviewState } from './review'

/**
 * A PAGE'S PICTURE
 * =============================================================================
 * A page research reads declares its own lead image, the picture its link
 * preview shows, and research keeps that address on the source. The app
 * shows it small beside the page so a list of pages is quicker to scan, and
 * for a page the user has said is them that is a bio or speaker page, offers
 * it as their photo.
 *
 * What decides who is in a picture is the user's own "This is them" on the
 * page, never the picture: no face is ever compared, matched or recognised.
 * An article's lead image is as likely to be someone else, a logo or a stock
 * photo, so only a bio or speaker page's picture is ever offered as a face,
 * and only by asking.
 *
 * Pure, and free of `server-only`, so it is tested directly.
 * =============================================================================
 */

/** Pages where the lead image is usually the person the page is about. */
const PORTRAIT_PAGES = new Set(['company_bio', 'conference'])

function metadataOf(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {}
}

/** The source's lead image, or null when it has none fit to fetch. */
export function sourceImageUrl(metadata: unknown): string | null {
  const image = metadataOf(metadata).image
  if (typeof image !== 'string' || image.length > 2000) return null
  let url: URL
  try {
    url = new URL(image)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password) return null
  if (/\.svg$/i.test(url.pathname)) return null
  if (isRestrictedPhotoHost(url.toString())) return null
  return url.toString()
}

/** People this page's picture was offered to and turned down for. */
export function photoSkippedFor(metadata: unknown): string[] {
  const skipped = metadataOf(metadata).photoSkippedFor
  return Array.isArray(skipped) ? skipped.filter((id): id is string => typeof id === 'string') : []
}

/** The metadata with this person added to those who said no to its picture. */
export function withPhotoSkipped(metadata: unknown, personId: string): Record<string, unknown> {
  const current = metadataOf(metadata)
  return { ...current, photoSkippedFor: [...new Set([...photoSkippedFor(current), personId])] }
}

/**
 * Whether to offer this page's picture as the person's photo: a bio or
 * speaker page the user themselves said is them, with a picture, for someone
 * who has no photo yet, unless they already said no to it.
 */
export function offersPhoto(input: {
  state: ReviewState
  reviewed: boolean
  sourceType: string | null
  metadata: unknown
  personId: string
  personHasPhoto: boolean
}): boolean {
  return (
    input.state === 'kept' &&
    input.reviewed &&
    !input.personHasPhoto &&
    PORTRAIT_PAGES.has(input.sourceType ?? '') &&
    sourceImageUrl(input.metadata) !== null &&
    !photoSkippedFor(input.metadata).includes(input.personId)
  )
}
