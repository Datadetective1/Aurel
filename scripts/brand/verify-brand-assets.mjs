/**
 * QUALITY GATE FOR /brand
 * =============================================================================
 * Checks the things that are cheap to get wrong and expensive to notice late:
 * an export at the wrong size, a "transparent" PNG that is silently opaque, a
 * colour that is not a brand token, or a banner whose content strays into the
 * region a platform crops or covers.
 *
 *   node scripts/brand/verify-brand-assets.mjs
 * =============================================================================
 */
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import sharp from 'sharp'
import { OBSIDIAN, PEARL } from './lib/brand-source.mjs'

const OUT = join(process.cwd(), 'brand')

/** Every colour any asset is allowed to contain, as [r,g,b]. */
const ALLOWED = [
  ...Object.values(PEARL),
  ...Object.values(OBSIDIAN),
]
  .filter((v) => typeof v === 'string' && v.startsWith('#'))
  .map(hexToRgb)

function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Expected pixel dimensions, parsed from the filename where it states them. */
function expectedFromName(name) {
  const wh = name.match(/-(\d+)x(\d+)\.png$/)
  if (wh) return { w: Number(wh[1]), h: Number(wh[2]) }
  const square = name.match(/-(\d+)\.png$/)
  if (square) return { w: Number(square[1]), h: Number(square[1]) }
  return null
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/**
 * Nearest allowed brand colour, in plain euclidean RGB.
 *
 * Antialiasing and low-opacity strokes blend toward the background, so a pixel
 * is judged against the whole palette and only flagged when it is far from all
 * of it. This catches a stray hue, not a soft edge.
 */
function distanceToPalette([r, g, b]) {
  let best = Infinity
  for (const [pr, pg, pb] of ALLOWED) {
    const d = Math.sqrt((r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2)
    if (d < best) best = d
  }
  return best
}

async function main() {
  const files = walk(OUT).filter((f) => f.endsWith('.png'))
  const problems = []

  for (const file of files) {
    const rel = relative(OUT, file).replace(/\\/g, '/')
    const img = sharp(file)
    const meta = await img.metadata()

    // --- dimensions ------------------------------------------------------
    const expected = expectedFromName(rel)
    if (expected && (meta.width !== expected.w || meta.height !== expected.h)) {
      problems.push(`${rel}: expected ${expected.w}x${expected.h}, got ${meta.width}x${meta.height}`)
    }

    // --- transparency ----------------------------------------------------
    const shouldBeTransparent = /logo\/atturel-(logo-primary|mark)-/.test(rel)
    const { data, info } = await img
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    let transparentPixels = 0
    for (let i = 3; i < data.length; i += info.channels) {
      if (data[i] < 250) transparentPixels++
    }
    const totalPixels = info.width * info.height

    if (shouldBeTransparent && transparentPixels === 0) {
      problems.push(`${rel}: declared transparent but has no transparent pixels`)
    }
    if (!shouldBeTransparent && transparentPixels / totalPixels > 0.5) {
      problems.push(`${rel}: unexpectedly transparent (${pct(transparentPixels / totalPixels)})`)
    }

    // --- palette ---------------------------------------------------------
    // Sampled rather than exhaustive: a 4200x700 banner is 2.9M pixels and a
    // stray hue large enough to matter cannot hide from a 1-in-97 sample.
    let offPalette = 0
    let sampled = 0
    const stride = info.channels * 97
    for (let i = 0; i + info.channels <= data.length; i += stride) {
      if (data[i + 3] < 200) continue
      sampled++
      if (distanceToPalette([data[i], data[i + 1], data[i + 2]]) > 42) offPalette++
    }
    if (sampled > 0 && offPalette / sampled > 0.02) {
      problems.push(
        `${rel}: ${pct(offPalette / sampled)} of sampled pixels are not near a brand token`,
      )
    }

    // --- weight ----------------------------------------------------------
    const bytes = statSync(file).size
    if (bytes > 2_000_000) problems.push(`${rel}: ${(bytes / 1e6).toFixed(1)}mb is too heavy`)
  }

  /* ---- platform-specific safe regions ---------------------------------- */

  // X overlays the avatar on the lower left of the header. Anything drawn there
  // is not "subtle", it is hidden.
  for (const theme of ['pearl', 'obsidian']) {
    const f = join(OUT, 'x', `atturel-x-header-${theme}-1500x500.png`)
    const ink = await inkCoverage(f, { left: 0, top: 250, width: 300, height: 250 })
    if (ink > 0.02) problems.push(`x header (${theme}): ${pct(ink)} ink under the avatar overlay`)
  }

  // LinkedIn crops covers hard on narrow viewports. Content must survive a
  // centre crop to roughly half the width.
  for (const theme of ['pearl', 'obsidian']) {
    const f = join(OUT, 'linkedin', `atturel-linkedin-cover-${theme}-4200x700.png`)
    const edgeInk = await inkCoverage(f, { left: 0, top: 0, width: 1050, height: 700 })
    if (edgeInk > 0.01) {
      problems.push(`linkedin cover (${theme}): ${pct(edgeInk)} ink in the outer quarter (crop risk)`)
    }
  }

  // The avatar must survive a circular crop: X renders it as a circle.
  for (const f of ['x/atturel-x-profile-400.png', 'linkedin/atturel-linkedin-logo-400.png']) {
    const outside = await inkOutsideCircle(join(OUT, f))
    if (outside > 0.005) problems.push(`${f}: ${pct(outside)} ink outside the inscribed circle`)
  }

  console.log(`checked ${files.length} raster files`)
  if (problems.length === 0) {
    console.log('all checks passed')
  } else {
    console.log(`\n${problems.length} problem(s):`)
    for (const p of problems) console.log(`  - ${p}`)
    process.exitCode = 1
  }
}

/** Fraction of a region whose pixels differ from that image's own background. */
async function inkCoverage(file, region) {
  const img = sharp(file)
  const { data: bgData } = await sharp(file)
    .extract({ left: 2, top: 2, width: 2, height: 2 })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const bg = [bgData[0], bgData[1], bgData[2]]

  const { data, info } = await img
    .extract(region)
    .raw()
    .toBuffer({ resolveWithObject: true })

  let ink = 0
  const total = info.width * info.height
  for (let i = 0; i + info.channels <= data.length; i += info.channels) {
    const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2])
    if (d > 24) ink++
  }
  return ink / total
}

/** Fraction of ink falling outside the largest inscribed circle. */
async function inkOutsideCircle(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true })
  const bg = [data[0], data[1], data[2]]
  const r = Math.min(info.width, info.height) / 2
  const cx = info.width / 2
  const cy = info.height / 2
  let outside = 0
  let total = 0
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels
      const d =
        Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2])
      if (d <= 24) continue
      total++
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) outside++
    }
  }
  return total === 0 ? 0 : outside / total
}

const pct = (n) => `${(n * 100).toFixed(1)}%`

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
