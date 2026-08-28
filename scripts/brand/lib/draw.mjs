import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import opentype from 'opentype.js'
import { APP_ICON, LOCKUP, MARK_STROKES, MARK_STROKE_WIDTH } from './brand-source.mjs'

/**
 * DRAWING PRIMITIVES
 * =============================================================================
 * Text is converted to outlines here rather than referenced as a font. A logo
 * SVG that names "Instrument Serif" renders as Times on any machine that does
 * not have it, which is every machine a journalist or a partner will open it
 * on. Outlined paths are the only form that travels.
 * =============================================================================
 */

const FONT_DIR = process.env.BRAND_FONT_DIR ?? join(process.cwd(), '.brandtmp', 'fonts')

const FONT_FILES = {
  serif: 'InstrumentSerif-400.woff',
  sans400: 'InstrumentSans-400.woff',
  sans500: 'InstrumentSans-500.woff',
  sans600: 'InstrumentSans-600.woff',
}

const cache = new Map()

export function font(which) {
  if (cache.has(which)) return cache.get(which)
  const path = join(FONT_DIR, FONT_FILES[which])
  if (!existsSync(path)) {
    throw new Error(
      `Missing font ${path}.\nRun: node scripts/brand/fetch-fonts.mjs\n` +
        `(Instrument Sans and Instrument Serif are OFL; the site loads the same ` +
        `families through next/font.)`,
    )
  }
  const buf = readFileSync(path)
  const parsed = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  cache.set(which, parsed)
  return parsed
}

/** Advance width of a string at a given size, honouring kerning and tracking. */
export function textWidth(which, text, size, tracking = 0) {
  const f = font(which)
  const scale = size / f.unitsPerEm
  let w = 0
  const glyphs = f.stringToGlyphs(text)
  for (let i = 0; i < glyphs.length; i++) {
    w += glyphs[i].advanceWidth * scale
    if (i < glyphs.length - 1) {
      w += f.getKerningValue(glyphs[i], glyphs[i + 1]) * scale
    }
    w += tracking * size
  }
  return w
}

/**
 * Outlined text as a <path>. `x`/`y` are the baseline origin.
 * Tracking is in ems, matching the CSS `tracking-[...]` values.
 */
export function textPath(which, text, x, y, size, fill, tracking = 0) {
  const f = font(which)
  const path = f.getPath(text, x, y, size, { kerning: true, letterSpacing: tracking })
  path.fill = fill
  return `<path d="${path.toPathData(3)}" fill="${fill}"/>`
}

/** Cap height of a face at a given size — used for optical vertical centring. */
export function capHeight(which, size) {
  const f = font(which)
  const os2 = f.tables.os2
  const cap = os2?.sCapHeight ?? f.tables.head.yMax * 0.7
  return (cap / f.unitsPerEm) * size
}

/**
 * The aperture logomark, drawn at `size` px with its top-left at (x, y).
 * Scales the 24-unit grid, including the stroke width, so the mark is never
 * distorted and its weight stays proportional.
 */
export function markSvg(x, y, size, color, strokeWidth = MARK_STROKE_WIDTH) {
  const s = size / 24
  const strokes = MARK_STROKES.map(
    (st) =>
      `<path d="${st.d}" opacity="${st.opacity}"/>`,
  ).join('')
  return (
    `<g transform="translate(${round(x)} ${round(y)}) scale(${round(s, 6)})" ` +
    `fill="none" stroke="${color}" stroke-width="${strokeWidth}" ` +
    `stroke-linecap="round">${strokes}</g>`
  )
}

/**
 * The official square app icon (public/icon.svg) at `size` px.
 * `rounded` false gives a full-bleed tile, which is what a circular avatar crop
 * needs — a rounded square inside a circle loses its corners and reads as a
 * mistake.
 */
export function appIconSvg(x, y, size, bg, accent, rounded = true) {
  const s = size / 24
  const rect = rounded
    ? `<rect width="24" height="24" rx="${APP_ICON.radius}" fill="${bg}"/>`
    : `<rect width="24" height="24" fill="${bg}"/>`
  const strokes = APP_ICON.strokes
    .map(
      (st) =>
        `<path d="${st.d}" stroke-width="${st.width}" opacity="${st.opacity}"/>`,
    )
    .join('')
  return (
    `<g transform="translate(${round(x)} ${round(y)}) scale(${round(s, 6)})">${rect}` +
    `<g fill="none" stroke="${accent}" stroke-linecap="round">${strokes}</g></g>`
  )
}

/**
 * Mark + wordmark, laid out exactly as <Wordmark /> does it: `items-center`
 * against a `leading-none` line box, mark and name both at 1.15em.
 *
 * Returns the markup plus the lockup's measured box, so callers can centre the
 * real thing instead of guessing at it.
 */
export function lockup({ x, y, fontSize, inkColor, accentColor, name }) {
  const f = font('serif')
  const glyphSize = fontSize * LOCKUP.markEm
  const markSize = fontSize * LOCKUP.markEm
  const gap = fontSize * LOCKUP.gapEm

  const nameWidth = textWidth('serif', name, glyphSize, LOCKUP.tracking)
  const width = markSize + gap + nameWidth

  // `leading-none` sets the line box to 1em; the browser centres the font's
  // content area inside it, which for this face overflows top and bottom.
  const lineBox = glyphSize
  const contentHeight = ((f.ascender - f.descender) / f.unitsPerEm) * glyphSize
  const halfLeading = (lineBox - contentHeight) / 2
  const baseline = y + halfLeading + (f.ascender / f.unitsPerEm) * glyphSize

  // items-center: the taller mark box straddles the line box.
  const markY = y + (lineBox - markSize) / 2

  const svg =
    markSvg(x, markY, markSize, accentColor) +
    textPath('serif', name, x + markSize + gap, baseline, glyphSize, inkColor, LOCKUP.tracking)

  return { svg, width, height: Math.max(markSize, lineBox), markSize }
}

/** Measure a lockup without emitting it. */
export function lockupWidth(name, fontSize) {
  const glyphSize = fontSize * LOCKUP.markEm
  return (
    fontSize * LOCKUP.markEm +
    fontSize * LOCKUP.gapEm +
    textWidth('serif', name, glyphSize, LOCKUP.tracking)
  )
}

/**
 * THE MOTIF, AT SCALE — WHY THERE IS NO FIELD HERE
 * -----------------------------------------------------------------------------
 * The first cut of these assets used a multi-ring <ApertureField />, and it
 * failed the way DESIGN_SYSTEM.md says it always fails: past a certain size the
 * concentric arches stop reading as a threshold and read as vertical stripes.
 * That document records the motif being pulled from the marketing hero for this
 * exact reason, and reduced to a *single* arch in transactional email.
 *
 * So there are two motif primitives and no field. `watermarkMark` is the
 * logomark itself, enlarged and faint — it cannot drift off-brand because it is
 * the same three strokes. `thresholdArch` is one wide arch used to frame
 * centred content, which is the email treatment at banner scale.
 */

/**
 * The logomark, enlarged as a faint watermark. Same geometry, same proportions,
 * one group opacity over the top.
 */
export function watermarkMark(x, y, size, color, opacity) {
  // Thin stroke, not the mark's own 1.5.
  //
  // Scaling the logomark uniformly scales its stroke too, and at watermark size
  // that turns three hairlines into three slabs — the mark stops being a drawn
  // line and becomes a grey shape. <ApertureField /> makes the same move for
  // the same reason: it draws the identical geometry at 0.35 rather than 1.5
  // precisely because it renders large. This sits just above that, since these
  // canvases are smaller than a viewport.
  return `<g opacity="${opacity}">${markSvg(x, y, size, color, 0.45)}</g>`
}

/**
 * A single arch, wide enough to stand content inside it.
 *
 * Built from the same construction as arch(): a semicircular crown of radius
 * `radius` closing onto straight legs that drop to `baseY`. Only the radius
 * varies, which is exactly the freedom the component's own `halfWidth`
 * parameter has.
 */
export function thresholdArch({ cx, baseY, radius, color, strokeWidth, opacity }) {
  const springY = baseY - radius
  return (
    `<path d="M${round(cx - radius)} ${round(baseY)} V${round(springY)} ` +
    `a${round(radius)} ${round(radius)} 0 0 1 ${round(radius * 2)} 0 V${round(baseY)}" ` +
    `fill="none" stroke="${color}" stroke-width="${round(strokeWidth, 2)}" ` +
    `stroke-linecap="round" opacity="${opacity}"/>`
  )
}

/** A hairline rule, the flat form of <ApertureRule />'s divider. */
export function rule(x, y, w, color, opacity = 1, thickness = 2) {
  return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${thickness}" fill="${color}" opacity="${opacity}"/>`
}

export function svgDoc(width, height, body, background) {
  const bg = background ? `<rect width="${width}" height="${height}" fill="${background}"/>` : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${bg}${body}</svg>`
  )
}

export function round(n, dp = 2) {
  return Number.parseFloat(n.toFixed(dp))
}

export function ensureDir(file) {
  mkdirSync(dirname(file), { recursive: true })
}
