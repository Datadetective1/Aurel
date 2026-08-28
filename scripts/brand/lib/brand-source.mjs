/**
 * BRAND SOURCE OF TRUTH — MIRRORED, NOT INVENTED
 * =============================================================================
 * Every value here is copied from a real file in this repository. Nothing in
 * this module is a design decision; it is a transcription, kept in one place so
 * a drift between the site and the social assets is a diff rather than a
 * discovery.
 *
 *   geometry  <- src/components/brand/aperture.tsx   (ApertureMark)
 *   appIcon   <- public/icon.svg                     (official square icon)
 *   pearl     <- src/app/globals.css   :root
 *   obsidian  <- src/app/globals.css   .dark
 *   type      <- src/app/layout.tsx    (next/font: Instrument Sans + Serif)
 *   copy      <- src/lib/brand/index.ts + src/app/(marketing)/page.tsx
 *
 * If any of those change, re-run the generator rather than editing an export.
 * =============================================================================
 */

/**
 * Arch path on a 0 0 24 24 grid, parameterised by half-width.
 * Transcribed verbatim from aperture.tsx so the curve is identical, not similar.
 */
export function arch(halfWidth, baseline = 21, springLine = 12) {
  const left = 12 - halfWidth
  return `M${left} ${baseline} V${springLine} a${halfWidth} ${halfWidth} 0 0 1 ${halfWidth * 2} 0 V${baseline}`
}

/**
 * <ApertureMark />, as strokes on the 24-grid. Three concentric arches plus the
 * vanishing line they converge on. Opacities and stroke width are the
 * component's defaults.
 */
export const MARK_STROKES = [
  { d: arch(9), opacity: 1 },
  { d: arch(4.5), opacity: 0.62 },
  { d: 'M12 21 V13.5', opacity: 0.38 },
]
export const MARK_STROKE_WIDTH = 1.5

/**
 * public/icon.svg. Deliberately NOT the same geometry as ApertureMark — the
 * icon springs higher and sits on a 19 baseline so it survives a 5px rounded
 * square. It is the official square mark, so square assets reuse it rather
 * than re-deriving one from the logomark.
 */
export const APP_ICON = {
  radius: 5,
  strokes: [
    { d: 'M5 19 V12.5 a7 7 0 0 1 14 0 V19', width: 1.4, opacity: 1 },
    { d: 'M8.5 19 V12.5 a3.5 3.5 0 0 1 7 0 V19', width: 1.2, opacity: 0.62 },
    { d: 'M12 19 V13.8', width: 1.1, opacity: 0.4 },
  ],
}

/** Design tokens, verbatim from globals.css. */
export const PEARL = {
  name: 'Pearl',
  bg: '#fbf9f6',
  bgSunken: '#f3f0ea',
  surface: '#ffffff',
  ink: '#1a1815',
  inkSecondary: '#4a4741',
  inkMuted: '#6b6862',
  line: '#e7e2d9',
  lineStrong: '#c6bfb1',
  accent: '#856427',
  accentGraphic: '#b5893f',
}

export const OBSIDIAN = {
  name: 'Obsidian',
  bg: '#0d0d0f',
  bgSunken: '#08080a',
  surface: '#141417',
  ink: '#f2efe9',
  inkSecondary: '#b4b0a8',
  inkMuted: '#9b978f',
  line: '#26262b',
  lineStrong: '#44444c',
  accent: '#d9b074',
  accentGraphic: '#d9b074',
}

/**
 * Copy. Only strings that already appear in production.
 *   name     <- brand.name
 *   tagline  <- brand.tagline, and the marketing <h1>
 *   eyebrow  <- the <Badge> directly above that <h1>
 */
export const COPY = {
  name: 'Atturel',
  tagline: 'Walk into every room prepared.',
  eyebrow: 'Professional relationship intelligence',
  domain: 'atturel.com',
}

/**
 * Wordmark lockup proportions, expressed in ems of the wordmark's font-size so
 * the lockup scales as one object.
 *
 * From <Wordmark />: `inline-flex items-center gap-2.5`, mark at `h-[1.15em]`,
 * name in the display face at `text-[1.15em] leading-none tracking-[-0.01em]`.
 * Mark and name therefore share a size, and the gap is the one fixed value in
 * the component (10px against an 18px wordmark in the site header) — carried
 * here as its em equivalent so it does not go slack at billboard sizes.
 */
export const LOCKUP = {
  markEm: 1.15,
  gapEm: 10 / 18,
  tracking: -0.01,
}
