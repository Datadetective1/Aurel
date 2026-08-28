/**
 * Fetch the two Instrument faces the site already loads through next/font.
 *
 * They are not committed: they are OFL-licensed upstream files, and next/font
 * fetches its own copies at build time, so a second set in the repository would
 * be a copy that can go stale without anything noticing. This script pulls them
 * into .brandtmp/ (gitignored) as a build input for the asset generator.
 *
 *   node scripts/brand/fetch-fonts.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), '.brandtmp', 'fonts')

// A pre-woff2 user agent, so the CSS API answers with .woff rather than .woff2 —
// opentype.js reads woff, and does not read woff2.
const LEGACY_UA =
  'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0 Safari/537.36'

const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif&display=swap'

const main = async () => {
  mkdirSync(OUT, { recursive: true })

  const css = await (await fetch(CSS_URL, { headers: { 'User-Agent': LEGACY_UA } })).text()

  const faces = css
    .split('@font-face')
    .slice(1)
    // The latin subset only. Every family ships several unicode-range slices and
    // the assets are latin; taking them all would quadruple the download for
    // glyphs no asset uses.
    .filter((block) => /U\+0000-00FF/.test(block))
    .map((block) => ({
      family: block.match(/font-family:\s*'([^']+)'/)?.[1],
      weight: block.match(/font-weight:\s*(\d+)/)?.[1],
      url: block.match(/url\(([^)]+)\)/)?.[1],
    }))
    .filter((f) => f.family && f.weight && f.url)

  if (faces.length === 0) throw new Error('No latin faces found in the Google Fonts response.')

  for (const face of faces) {
    const name = `${face.family.replace(/\s+/g, '')}-${face.weight}.woff`
    const buf = Buffer.from(await (await fetch(face.url)).arrayBuffer())
    if (buf.subarray(0, 4).toString('ascii') !== 'wOFF') {
      throw new Error(`${name} is not a woff file — the CSS API changed its format.`)
    }
    writeFileSync(join(OUT, name), buf)
    console.log(`  ${name}  ${buf.length}b`)
  }
  console.log(`\n${faces.length} faces -> ${OUT}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
