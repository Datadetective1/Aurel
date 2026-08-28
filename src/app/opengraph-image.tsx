import { ImageResponse } from 'next/og'
import { brand } from '@/lib/brand'

/**
 * The social preview card.
 *
 * There was no og:image at all, while the Twitter card declared
 * summary_large_image — so every share of this link rendered as a blank slab
 * with a headline. Generating it here rather than committing a PNG keeps the
 * wording tied to the brand registry, so a rename cannot leave a stale image
 * behind saying the old name.
 *
 * Drawn with borders rather than an inline SVG because Satori (which rasterises
 * this) supports the box model far more predictably than it supports paths.
 * The arches are the same motif as the app icon: nested thresholds.
 */
export const alt = `${brand.name} — ${brand.descriptor}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const INK = '#0d0d0f'
const GOLD = '#d9b074'
const PAPER = '#fbf9f6'

function Arch({ size: s, opacity, width }: { size: number; opacity: number; width: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: '50%',
        marginLeft: -s / 2,
        width: s,
        height: s / 2,
        borderTop: `${width}px solid ${GOLD}`,
        borderLeft: `${width}px solid ${GOLD}`,
        borderRight: `${width}px solid ${GOLD}`,
        borderTopLeftRadius: s / 2,
        borderTopRightRadius: s / 2,
        opacity,
      }}
    />
  )
}

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: INK,
        padding: 72,
        position: 'relative',
      }}
    >
      {/* The motif, bled off the bottom-right so it reads as texture. */}
      <div
        style={{
          position: 'absolute',
          right: -120,
          bottom: -160,
          width: 620,
          height: 320,
          display: 'flex',
        }}
      >
        <Arch size={620} opacity={0.28} width={3} />
        <Arch size={430} opacity={0.2} width={3} />
        <Arch size={240} opacity={0.13} width={3} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            fontSize: 34,
            color: PAPER,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          {brand.name}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', width: 88, height: 3, background: GOLD }} />
        <div
          style={{
            display: 'flex',
            marginTop: 34,
            fontSize: 68,
            lineHeight: 1.08,
            color: PAPER,
            maxWidth: 880,
          }}
        >
          {brand.descriptor}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 26,
            fontSize: 30,
            lineHeight: 1.35,
            color: '#9d9a95',
            maxWidth: 760,
          }}
        >
          {brand.tagline}
        </div>
      </div>
    </div>,
    size,
  )
}
