/**
 * ATTUREL SOCIAL BRAND ASSET GENERATOR
 * =============================================================================
 * Rebuilds everything in /brand from the values in lib/brand-source.mjs, which
 * are transcribed from the running product. Nothing here is drawn by hand and
 * nothing is traced from a screenshot: the arches are the component's own path
 * data, the colours are the CSS custom properties, and the wordmark is the real
 * Instrument Serif outlined at export time.
 *
 *   node scripts/brand/fetch-fonts.mjs      # once, into .brandtmp/
 *   node scripts/brand/build-brand-assets.mjs
 *
 * Writes PNG rather than JPEG throughout. These compositions are flat fields
 * crossed by hairline strokes, which is precisely the content JPEG handles
 * worst — chroma subsampling frays a 2px brass rule and ringing haloes the
 * arches. The files are small enough that there is nothing to buy by trading
 * that away.
 * =============================================================================
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { COPY, OBSIDIAN, PEARL } from './lib/brand-source.mjs'
import {
  appIconSvg,
  capHeight,
  font,
  lockup,
  lockupWidth,
  markSvg,
  round,
  rule,
  svgDoc,
  textPath,
  textWidth,
  thresholdArch,
  watermarkMark,
} from './lib/draw.mjs'

const ROOT = process.cwd()
const OUT = join(ROOT, 'brand')

const written = []

async function emitPng(relPath, svg, width, height, { transparent = false } = {}) {
  const file = join(OUT, relPath)
  mkdirSync(join(file, '..'), { recursive: true })
  let pipeline = sharp(Buffer.from(svg), { density: 72 }).resize(width, height, {
    fit: 'fill',
    background: transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : undefined,
  })
  pipeline = pipeline.png({ compressionLevel: 9, palette: false })
  const buf = await pipeline.toBuffer()
  writeFileSync(file, buf)
  written.push({ path: relPath, bytes: buf.length, width, height })
}

function emitSvg(relPath, svg) {
  const file = join(OUT, relPath)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, svg, 'utf8')
  written.push({ path: relPath, bytes: Buffer.byteLength(svg), svg: true })
}

/* ---------------------------------------------------------------- helpers */

/** Greedy line wrap using real advance widths. */
function wrap(which, text, size, maxWidth, tracking = 0) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (textWidth(which, next, size, tracking) > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Eyebrow, in the `.label` treatment: uppercase, 0.14em, Instrument Sans 500. */
function eyebrow(text, x, baseline, size, color) {
  return textPath('sans500', text.toUpperCase(), x, baseline, size, color, 0.14)
}

function eyebrowWidth(text, size) {
  return textWidth('sans500', text.toUpperCase(), size, 0.14)
}

/**
 * The tight ink bounds of a lockup, so logo files crop to the artwork rather
 * than to a box with arbitrary air in it.
 *
 * The mark's ink is inset within its own square: the outer arch runs from x=3
 * to x=21 on the 24 grid and the round cap adds half the 1.5 stroke, giving
 * 2.25 either side. The text bounds come from the outlines themselves.
 */
function lockupBounds({ fontSize, name }) {
  const f = font('serif')
  const glyphSize = fontSize * 1.15
  const markSize = fontSize * 1.15
  const gap = fontSize * (10 / 18)

  const lineBox = glyphSize
  const contentHeight = ((f.ascender - f.descender) / f.unitsPerEm) * glyphSize
  const halfLeading = (lineBox - contentHeight) / 2
  const baselineOffset = halfLeading + (f.ascender / f.unitsPerEm) * glyphSize
  const markYOffset = (lineBox - markSize) / 2

  const inset = (2.25 / 24) * markSize
  const markLeft = inset
  const markTop = markYOffset + inset
  const markBottom = markYOffset + (21.75 / 24) * markSize

  const textX = markSize + gap
  const path = f.getPath(name, textX, baselineOffset, glyphSize, {
    kerning: true,
    letterSpacing: -0.01,
  })
  const bb = path.getBoundingBox()

  return {
    x0: Math.min(markLeft, bb.x1),
    y0: Math.min(markTop, bb.y1),
    x1: Math.max(markSize - inset, bb.x2),
    y1: Math.max(markBottom, bb.y2),
    markSize,
  }
}

/** A logo file: mark + wordmark, tight-cropped, transparent. */
function logoSvg({ fontSize, inkColor, accentColor, name = COPY.name }) {
  const b = lockupBounds({ fontSize, name })
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  const { svg } = lockup({ x: -b.x0, y: -b.y0, fontSize, inkColor, accentColor, name })
  return {
    svg: svgDoc(round(w), round(h), svg),
    width: w,
    height: h,
    markSize: b.markSize,
  }
}

/* ------------------------------------------------------------ compositions */

/**
 * The poster system behind every social template.
 *
 * One composition, four aspect ratios. It is the marketing hero's own hierarchy
 * — eyebrow, then the tagline as the display line — with the wordmark parked
 * top-left and the aperture bleeding off the bottom-right the way it bleeds off
 * the bottom of the final call to action on the site.
 */
function poster({ w, h, theme, headline = COPY.tagline, kicker = COPY.eyebrow, footer }) {
  const base = Math.min(w, h)
  const pad = round(base * 0.085)
  const inner = w - pad * 2

  const lockFs = round(base * 0.037)
  const kickFs = round(base * 0.0235)
  // Sized by aspect, because one number cannot serve a 1.9:1 card and a 4:5
  // poster. Wide formats want a single emphatic line; on the square and
  // portrait ratios that same line left the middle two-thirds of the canvas
  // empty and the composition read as content that had fallen to the bottom,
  // so there the headline is set large enough to take two lines and carry the
  // space it is standing in.
  const aspect = w / h
  const headFs = round(aspect >= 1.5 ? w * 0.075 : w * 0.115)
  const footFs = round(base * 0.028)

  const parts = []

  // The logomark itself, enlarged and faint, bleeding off the bottom-right.
  // Not a field: see the note in draw.mjs. Placed so the crown is inside the
  // frame — an arch cropped to its legs is the stripe failure again.
  const markSize = base * 0.92
  parts.push(
    watermarkMark(w - markSize * 0.7, h - markSize * 0.76, markSize, theme.ink, 0.16),
  )

  // Wordmark, top-left.
  const lock = lockup({
    x: pad,
    y: pad,
    fontSize: lockFs,
    inkColor: theme.ink,
    accentColor: theme.accent,
    name: COPY.name,
  })
  parts.push(lock.svg)

  // Bottom block, built upward from the baseline so it sits on the padding.
  const footBaseline = h - pad
  if (footer) {
    parts.push(textPath('sans400', footer, pad, footBaseline, footFs, theme.inkMuted, 0))
  }

  const headLines = wrap('serif', headline, headFs, inner, -0.01)
  const headLead = headFs * 1.06
  // 3.2x, not 2.35x: the display face's descenders are long, and at the larger
  // headline sizes the tail of a 'p' was closing to within a few pixels of the
  // domain underneath it.
  const headBottom = footer ? footBaseline - footFs * 3.2 : footBaseline
  const headBaseline0 = headBottom - (headLines.length - 1) * headLead

  headLines.forEach((line, i) => {
    parts.push(textPath('serif', line, pad, headBaseline0 + i * headLead, headFs, theme.ink, -0.01))
  })

  const kickBaseline = headBaseline0 - capHeight('serif', headFs) - base * 0.055
  parts.push(eyebrow(kicker, pad, kickBaseline, kickFs, theme.inkMuted))

  // Brass rule above the eyebrow — the one accent, used once.
  parts.push(
    rule(pad, kickBaseline - kickFs - base * 0.042, base * 0.075, theme.accentGraphic, 1, round(base * 0.0028)),
  )

  return svgDoc(w, h, parts.join(''), theme.bg)
}

/**
 * The banner system: LinkedIn and X share one centred composition so the two
 * profiles read as the same company rather than two interpretations of it.
 *
 * `safeLeft` keeps the block clear of the avatar X overlays on the lower left.
 */
function banner({ w, h, theme, safeLeft = 0, taglineScale = 1 }) {
  const base = h
  const parts = []

  const lockFs = round(base * 0.135)
  const tagFs = round(base * 0.105 * taglineScale)
  const kickFs = round(base * 0.043)

  const lockW = lockupWidth(COPY.name, lockFs)
  const tagW = textWidth('serif', COPY.tagline, tagFs, -0.01)
  const kickW = eyebrowWidth(COPY.eyebrow, kickFs)

  // Centre on the region left after the avatar, not on the raw canvas, so the
  // block is optically centred in what a visitor actually sees.
  const fieldLeft = safeLeft
  const centre = fieldLeft + (w - fieldLeft) / 2

  // One arch, wide enough that the lockup and tagline stand inside it. The
  // crown clears the top of the block and the legs run off the bottom edge, so
  // it reads as a threshold the content is standing in rather than a shape
  // sitting behind it.
  //
  // Solved rather than eyeballed. The crown's apex sits at baseY - 2r, so for
  // the apex to land just above the block at 0.11h while the legs still run off
  // the bottom at 1.6h, the radius has to be 0.745h. An earlier pass used a
  // radius large enough to push the apex off-canvas, which left two curved
  // lines rising out of frame — the shoulders of an arch nobody can see is not
  // the motif, it is two curved lines.
  const archBaseY = h * 1.6
  const archRadius = h * 0.745
  parts.push(
    thresholdArch({
      cx: centre,
      baseY: archBaseY,
      radius: archRadius,
      color: theme.ink,
      strokeWidth: Math.max(h * 0.005, 1.5),
      opacity: 0.16,
    }),
  )

  const blockH = base * 0.135 + base * 0.085 + tagFs + base * 0.075 + kickFs
  const top = (h - blockH) / 2

  const lock = lockup({
    x: centre - lockW / 2,
    y: top,
    fontSize: lockFs,
    inkColor: theme.ink,
    accentColor: theme.accent,
    name: COPY.name,
  })
  parts.push(lock.svg)

  const tagBaseline = top + base * 0.135 + base * 0.085 + capHeight('serif', tagFs)
  parts.push(
    textPath('serif', COPY.tagline, centre - tagW / 2, tagBaseline, tagFs, theme.inkSecondary, -0.01),
  )

  const kickBaseline = tagBaseline + base * 0.075 + kickFs
  parts.push(eyebrow(COPY.eyebrow, centre - kickW / 2, kickBaseline, kickFs, theme.inkMuted))

  return svgDoc(w, h, parts.join(''), theme.bg)
}

/**
 * Square avatar. Full-bleed rather than rounded: X crops avatars to a circle
 * and LinkedIn to a rounded square, so a tile with its own corner radius loses
 * them and reads as a mistake. The arch keeps public/icon.svg's exact
 * proportions, which already sit safely inside the inscribed circle.
 */
function avatar({ size, theme }) {
  return svgDoc(size, size, appIconSvg(0, 0, size, theme.bg, theme.accent, false))
}

/* ------------------------------------------------------------------- build */

async function main() {
  console.log('Atturel brand assets\n')

  /* ---- logo -------------------------------------------------------- */

  for (const [theme, suffix] of [
    [PEARL, 'pearl'],
    [OBSIDIAN, 'obsidian'],
  ]) {
    const logo = logoSvg({ fontSize: 100, inkColor: theme.ink, accentColor: theme.accent })
    emitSvg(`logo/atturel-logo-primary-${suffix}.svg`, logo.svg)
    const pngW = 1600
    const pngH = Math.round((logo.height / logo.width) * pngW)
    // Both dimensions in the name: the lockup is horizontal, and a bare -1600
    // reads as a square to anyone scanning the folder (and to the verifier).
    await emitPng(`logo/atturel-logo-primary-${suffix}-${pngW}x${pngH}.png`, logo.svg, pngW, pngH, {
      transparent: true,
    })
  }

  // Standalone mark, tight to its own ink.
  for (const [theme, suffix] of [
    [PEARL, 'pearl'],
    [OBSIDIAN, 'obsidian'],
  ]) {
    const S = 1000
    const inset = (2.25 / 24) * S
    const span = S - inset * 2
    const markOnly = svgDoc(
      round(span),
      round(span),
      markSvg(-inset, -inset, S, theme.accent),
    )
    emitSvg(`logo/atturel-mark-${suffix}.svg`, markOnly)
    await emitPng(`logo/atturel-mark-${suffix}-512.png`, markOnly, 512, 512, { transparent: true })
  }

  // App icon: the existing public/icon.svg, carried through unmodified as the
  // source of record, plus raster sizes derived from it.
  const iconSource = readFileSync(join(ROOT, 'public', 'icon.svg'), 'utf8')
  emitSvg('logo/atturel-app-icon-source.svg', iconSource)
  for (const size of [1024, 512, 180, 32]) {
    await emitPng(`logo/atturel-app-icon-${size}.png`, iconSource, size, size)
  }

  /* ---- linkedin ---------------------------------------------------- */

  await emitPng('linkedin/atturel-linkedin-logo-400.png', avatar({ size: 400, theme: OBSIDIAN }), 400, 400)
  await emitPng(
    'linkedin/atturel-linkedin-logo-pearl-400.png',
    avatar({ size: 400, theme: PEARL }),
    400,
    400,
  )

  for (const [theme, suffix] of [
    [PEARL, 'pearl'],
    [OBSIDIAN, 'obsidian'],
  ]) {
    await emitPng(
      `linkedin/atturel-linkedin-cover-${suffix}-4200x700.png`,
      banner({ w: 4200, h: 700, theme, taglineScale: 0.92 }),
      4200,
      700,
    )
  }

  /* ---- x ----------------------------------------------------------- */

  await emitPng('x/atturel-x-profile-400.png', avatar({ size: 400, theme: OBSIDIAN }), 400, 400)
  await emitPng('x/atturel-x-profile-pearl-400.png', avatar({ size: 400, theme: PEARL }), 400, 400)

  for (const [theme, suffix] of [
    [PEARL, 'pearl'],
    [OBSIDIAN, 'obsidian'],
  ]) {
    await emitPng(
      `x/atturel-x-header-${suffix}-1500x500.png`,
      // The avatar and its ring occupy roughly the first 260px on the lower
      // left; centring on the remainder keeps the lockup out from under it.
      banner({ w: 1500, h: 500, theme, safeLeft: 300 }),
      1500,
      500,
    )
  }

  /* ---- social ------------------------------------------------------ */

  const socials = [
    ['og', 1200, 630],
    ['square', 1080, 1080],
    ['portrait', 1080, 1350],
    ['announcement', 1200, 627],
  ]

  for (const [name, w, h] of socials) {
    for (const [theme, suffix] of [
      [OBSIDIAN, 'obsidian'],
      [PEARL, 'pearl'],
    ]) {
      await emitPng(
        `social/atturel-${name}-${suffix}-${w}x${h}.png`,
        poster({ w, h, theme, footer: COPY.domain }),
        w,
        h,
      )
    }
  }

  /* ---- report ------------------------------------------------------ */

  const totalBytes = written.reduce((n, f) => n + f.bytes, 0)
  for (const f of written) {
    const dims = f.svg ? 'svg' : `${f.width}x${f.height}`
    console.log(`  ${f.path.padEnd(52)} ${dims.padStart(11)}  ${(f.bytes / 1024).toFixed(1)}kb`)
  }
  console.log(`\n${written.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)}mb total`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
