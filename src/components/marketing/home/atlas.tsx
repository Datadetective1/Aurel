import { initials } from '@/lib/utils'
import { ELENA, MEETING, NADIA, THEO } from './fixtures'
import { ProductFrame } from './frame'

/**
 * RELATIONSHIP INTELLIGENCE
 * =============================================================================
 * The Atlas, reduced to its grammar: you at the centre, the people you work
 * with, where they work, the meeting that brings them together and the promise
 * that is open. Every line is labelled with the evidence it rests on -- a
 * count of meetings, a conversation, the user's own note -- because the Atlas
 * draws nothing it cannot trace. No inferred associates, no enrichment.
 *
 * Two layouts of the same graph: wide for a desktop column, tall for a phone,
 * so the labels stay readable instead of shrinking with the viewport.
 * =============================================================================
 */

type NodeKind = 'you' | 'person' | 'org' | 'meeting' | 'commitment'
type NodeId = 'you' | 'elena' | 'theo' | 'nadia' | 'org' | 'meeting' | 'loop'
type Point = { x: number; y: number }

const NODES: { id: NodeId; kind: NodeKind; label: string; sub?: string }[] = [
  { id: 'you', kind: 'you', label: 'You' },
  { id: 'elena', kind: 'person', label: ELENA.name, sub: ELENA.role },
  { id: 'theo', kind: 'person', label: THEO.name, sub: THEO.role },
  { id: 'nadia', kind: 'person', label: NADIA.name, sub: NADIA.org },
  { id: 'org', kind: 'org', label: ELENA.org },
  { id: 'meeting', kind: 'meeting', label: 'Renewal review', sub: 'Thursday' },
  { id: 'loop', kind: 'commitment', label: 'Adoption breakdown', sub: 'You owe' },
]

/** `t` places the label along the line, from 0 at `from` to 1 at `to`; 0.5 is the middle. */
const EDGES: {
  from: NodeId
  to: NodeId
  label: string
  t?: number
  dashed?: boolean
  accent?: boolean
}[] = [
  { from: 'you', to: 'elena', label: '4 meetings', t: 0.42 },
  { from: 'you', to: 'theo', label: '2 conversations', t: 0.6 },
  { from: 'nadia', to: 'you', label: 'introduced you', t: 0.36 },
  { from: 'elena', to: 'org', label: 'works at', t: 0.72, dashed: true },
  { from: 'theo', to: 'org', label: 'works at', t: 0.72, dashed: true },
  { from: 'you', to: 'meeting', label: 'attending', dashed: true },
  { from: 'you', to: 'loop', label: 'for Elena', t: 0.6, accent: true },
]

const LAYOUTS: Record<
  'wide' | 'tall',
  { w: number; h: number; fs: number; at: Record<NodeId, Point> }
> = {
  wide: {
    w: 640,
    h: 430,
    fs: 1.12,
    at: {
      you: { x: 320, y: 228 },
      elena: { x: 170, y: 110 },
      theo: { x: 170, y: 340 },
      org: { x: 82, y: 228 },
      nadia: { x: 492, y: 340 },
      meeting: { x: 505, y: 112 },
      loop: { x: 326, y: 66 },
    },
  },
  tall: {
    w: 360,
    h: 522,
    fs: 1.08,
    at: {
      you: { x: 180, y: 300 },
      elena: { x: 88, y: 168 },
      theo: { x: 88, y: 445 },
      org: { x: 56, y: 306 },
      nadia: { x: 276, y: 445 },
      meeting: { x: 272, y: 205 },
      loop: { x: 180, y: 58 },
    },
  },
}

const R = { you: 30, person: 24 }

function Graph({ layout, className }: { layout: 'wide' | 'tall'; className?: string }) {
  const { w, h, fs, at } = LAYOUTS[layout]

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} role="presentation">
      {EDGES.map((e) => {
        const a = at[e.from]
        const b = at[e.to]
        const t = e.t ?? 0.5
        const mx = a.x + (b.x - a.x) * t
        const my = a.y + (b.y - a.y) * t
        return (
          <g key={`${e.from}-${e.to}`} className={e.accent ? 'text-accent-graphic' : 'text-line'}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="currentColor"
              strokeWidth={e.accent ? 1.5 : 1.25}
              strokeDasharray={e.dashed ? '4 5' : undefined}
            />
            <g className="text-ink-muted">
              <rect
                x={mx - e.label.length * 3.1 * fs - 6}
                y={my - 9 * fs}
                width={e.label.length * 6.2 * fs + 12}
                height={18 * fs}
                rx={9 * fs}
                className="text-bg"
                fill="currentColor"
              />
              <text
                x={mx}
                y={my + 3.6 * fs}
                textAnchor="middle"
                fontSize={10.5 * fs}
                fill="currentColor"
                className="text-ink-muted"
              >
                {e.label}
              </text>
            </g>
          </g>
        )
      })}

      {NODES.map((n) => {
        const p = at[n.id]
        if (n.kind === 'you') {
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={R.you} className="text-ink" fill="currentColor" />
              <text
                x={p.x}
                y={p.y + 4.5}
                textAnchor="middle"
                fontSize={13 * fs}
                className="text-bg"
                fill="currentColor"
                fontWeight={500}
              >
                You
              </text>
            </g>
          )
        }
        if (n.kind === 'person') {
          return (
            <g key={n.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={R.person}
                className="text-bg-sunken"
                fill="currentColor"
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={R.person}
                className="text-line"
                fill="none"
                stroke="currentColor"
              />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                fontSize={12 * fs}
                className="text-ink-secondary"
                fill="currentColor"
                fontWeight={500}
              >
                {initials(n.label)}
              </text>
              <text
                x={p.x}
                y={p.y + R.person + 16 * fs}
                textAnchor="middle"
                fontSize={12.5 * fs}
                className="text-ink"
                fill="currentColor"
              >
                {n.label}
              </text>
              <text
                x={p.x}
                y={p.y + R.person + 31 * fs}
                textAnchor="middle"
                fontSize={10.5 * fs}
                className="text-ink-muted"
                fill="currentColor"
              >
                {n.sub}
              </text>
            </g>
          )
        }
        // Organisation, meeting and commitment are labelled tiles, each with
        // a distinct shape so the kind never rests on colour alone.
        const width = Math.max(n.label.length, (n.sub ?? '').length) * 6.6 * fs + 28
        const height = (n.sub ? 40 : 28) * fs
        const shape =
          n.kind === 'org'
            ? { rx: 4, cls: 'text-surface', stroke: 'text-line' }
            : n.kind === 'meeting'
              ? { rx: 10, cls: 'text-surface', stroke: 'text-line' }
              : { rx: height / 2, cls: 'text-accent-wash', stroke: 'text-accent-graphic' }
        const labelText = layout === 'tall' && n.kind === 'org' ? n.label.split(' ')[0]! : n.label
        const tileW =
          layout === 'tall' && n.kind === 'org' ? labelText.length * 6.6 * fs + 24 : width
        return (
          <g key={n.id}>
            {/* An opaque base first, so no line shows through a tinted tile. */}
            <rect
              x={p.x - tileW / 2}
              y={p.y - height / 2}
              width={tileW}
              height={height}
              rx={shape.rx}
              className="text-surface"
              fill="currentColor"
            />
            <rect
              x={p.x - tileW / 2}
              y={p.y - height / 2}
              width={tileW}
              height={height}
              rx={shape.rx}
              className={shape.cls}
              fill="currentColor"
            />
            <rect
              x={p.x - tileW / 2}
              y={p.y - height / 2}
              width={tileW}
              height={height}
              rx={shape.rx}
              className={shape.stroke}
              fill="none"
              stroke="currentColor"
            />
            <text
              x={p.x}
              y={p.y + (n.sub ? -2 : 4) * fs}
              textAnchor="middle"
              fontSize={12 * fs}
              className="text-ink"
              fill="currentColor"
            >
              {labelText}
            </text>
            {n.sub ? (
              <text
                x={p.x}
                y={p.y + 13 * fs}
                textAnchor="middle"
                fontSize={10 * fs}
                className={n.kind === 'commitment' ? 'text-accent' : 'text-ink-muted'}
                fill="currentColor"
              >
                {n.sub}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

const LEGEND: { kind: NodeKind; label: string }[] = [
  { kind: 'you', label: 'You' },
  { kind: 'person', label: 'Person' },
  { kind: 'org', label: 'Organisation' },
  { kind: 'meeting', label: 'Meeting' },
  { kind: 'commitment', label: 'Commitment' },
]

function LegendMark({ kind }: { kind: NodeKind }) {
  if (kind === 'you') return <span className="bg-ink size-3 rounded-full" />
  if (kind === 'person')
    return <span className="border-line bg-bg-sunken size-3 rounded-full border" />
  if (kind === 'org') return <span className="border-line bg-surface size-3 rounded-[2px] border" />
  if (kind === 'meeting')
    return <span className="border-line bg-surface h-3 w-4 rounded-[4px] border" />
  return <span className="border-accent-graphic bg-accent-wash h-3 w-5 rounded-full border" />
}

export function AtlasVisual({ className }: { className?: string }) {
  return (
    <ProductFrame
      className={className}
      bodyClassName="p-3 sm:p-6"
      description={`A connection map with you at the centre. You have had four meetings with ${ELENA.name} and two conversations with ${THEO.name}; both work at ${ELENA.org}. ${NADIA.name} of ${NADIA.org} introduced you. You are attending the "${MEETING.title}" on Thursday, and you owe Elena an adoption breakdown. Every connection is labelled with the meeting, conversation or record it comes from.`}
    >
      <Graph layout="wide" className="hidden h-auto w-full sm:block" />
      <Graph layout="tall" className="mx-auto h-auto w-full max-w-[24rem] sm:hidden" />
      <ul className="border-line mt-2 flex flex-wrap justify-center gap-x-5 gap-y-2 border-t px-2 pt-4">
        {LEGEND.map((item) => (
          <li key={item.kind} className="text-ink-muted flex items-center gap-2 text-xs">
            <LegendMark kind={item.kind} />
            {item.label}
          </li>
        ))}
      </ul>
    </ProductFrame>
  )
}
