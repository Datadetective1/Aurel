import { ImageResponse } from 'next/og'

/**
 * Apple touch icon.
 *
 * The root metadata has always pointed at /apple-icon.png, and nothing has
 * ever served it — the URL answered 404, so an iOS home-screen bookmark fell
 * back to a screenshot of the page. Generated rather than committed so it
 * cannot drift from icon.svg, whose proportions it reproduces: the mark is an
 * arch, not an arc, and the straight legs are most of what makes it read as a
 * threshold at small sizes.
 */
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

const INK = '#0d0d0f'
const GOLD = '#d9b074'

/** Ratios lifted from icon.svg's 24-unit viewBox, so both marks stay in step. */
const UNIT = size.width / 24
const BASELINE = (24 - 19) * UNIT // legs stop where the SVG's do

function Arch({
  span,
  spring,
  stroke,
  opacity,
}: {
  span: number
  spring: number
  stroke: number
  opacity: number
}) {
  const width = span * UNIT
  const radius = width / 2
  return (
    <div
      style={{
        position: 'absolute',
        bottom: BASELINE,
        left: '50%',
        marginLeft: -radius,
        width,
        height: radius + spring * UNIT,
        borderTop: `${stroke}px solid ${GOLD}`,
        borderLeft: `${stroke}px solid ${GOLD}`,
        borderRight: `${stroke}px solid ${GOLD}`,
        borderTopLeftRadius: radius,
        borderTopRightRadius: radius,
        opacity,
      }}
    />
  )
}

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: INK,
        position: 'relative',
      }}
    >
      {/* span/spring in SVG units: outer 14 wide springing 6.5 above the base. */}
      <Arch span={14} spring={6.5} stroke={10} opacity={1} />
      <Arch span={7} spring={6.5} stroke={9} opacity={0.62} />
    </div>,
    size,
  )
}
