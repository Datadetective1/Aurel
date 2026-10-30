import { CalendarCheck, Handshake } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { DIRECTION_ICON } from '@/components/visual/direction'
import { brand } from '@/lib/brand'
import { DIRECTION_META } from '@/lib/visual/relationship-actions'
import { initials } from '@/lib/utils'
import { ELENA, NADIA, THEO, firstName } from './fixtures'
import { ProductFrame } from './frame'

/**
 * THE RELATIONSHIP, NOT JUST THE MEETING
 * =============================================================================
 * One composite: the room view, the person's history, the Atlas and the
 * follow-through lens, reduced to what sells the idea --
 *
 *   who is connected      a small map, every line labelled with its evidence
 *   what happened         the last meeting and what was asked in it
 *   why they connect      one connection, with the record it comes from
 *   what is owed          one thing you owe, one thing you are waiting on
 *
 * Every line names its source ("From your records", "4 meetings"): the Atlas
 * draws nothing it cannot trace.
 * =============================================================================
 */

type P = { x: number; y: number }
const AT: Record<'you' | 'elena' | 'theo' | 'nadia' | 'loop', P> = {
  you: { x: 180, y: 118 },
  elena: { x: 66, y: 56 },
  nadia: { x: 296, y: 56 },
  theo: { x: 66, y: 184 },
  loop: { x: 290, y: 190 },
}

const EDGES: {
  a: keyof typeof AT
  b: keyof typeof AT
  label: string
  t?: number
  accent?: boolean
  dashed?: boolean
}[] = [
  { a: 'you', b: 'elena', label: '4 meetings', t: 0.5 },
  { a: 'you', b: 'theo', label: '2 conversations', t: 0.5 },
  { a: 'nadia', b: 'elena', label: 'introduced you', t: 0.5 },
  { a: 'you', b: 'loop', label: 'you owe', t: 0.45, accent: true, dashed: true },
]

/** Radius of a person's node: large enough for the portrait to read as a face. */
const R = 22

const PEOPLE = [
  { key: 'elena' as const, person: ELENA, sub: ELENA.org },
  { key: 'theo' as const, person: THEO, sub: THEO.org },
  { key: 'nadia' as const, person: NADIA, sub: NADIA.org },
]

function ConnectionMap() {
  return (
    <svg viewBox="0 0 360 236" className="h-auto w-full" role="presentation">
      {EDGES.map((e) => {
        const a = AT[e.a]
        const b = AT[e.b]
        const t = e.t ?? 0.5
        const mx = a.x + (b.x - a.x) * t
        const my = a.y + (b.y - a.y) * t
        const w = e.label.length * 5.9 + 12
        return (
          <g key={`${e.a}-${e.b}`} className={e.accent ? 'text-accent-graphic' : 'text-line'}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="currentColor"
              strokeWidth={e.accent ? 1.5 : 1.25}
              strokeDasharray={e.dashed ? '4 4' : undefined}
            />
            <rect
              x={mx - w / 2}
              y={my - 9}
              width={w}
              height={18}
              rx={9}
              className="text-bg"
              fill="currentColor"
            />
            <text
              x={mx}
              y={my + 3.5}
              textAnchor="middle"
              fontSize={10.5}
              className="text-ink-muted"
              fill="currentColor"
            >
              {e.label}
            </text>
          </g>
        )
      })}

      <circle cx={AT.you.x} cy={AT.you.y} r={24} className="text-ink" fill="currentColor" />
      <text
        x={AT.you.x}
        y={AT.you.y + 4.5}
        textAnchor="middle"
        fontSize={12}
        fontWeight={500}
        className="text-bg"
        fill="currentColor"
      >
        You
      </text>

      {PEOPLE.map(({ key, person, sub }) => {
        const p = AT[key]
        return (
          <g key={key}>
            <circle cx={p.x} cy={p.y} r={R} className="text-bg-sunken" fill="currentColor" />
            {/* Initials underneath, the portrait over them: if the image is slow
                or fails, the node still says who it is. */}
            <text
              x={p.x}
              y={p.y + 4}
              textAnchor="middle"
              fontSize={11}
              fontWeight={500}
              className="text-ink-secondary"
              fill="currentColor"
            >
              {initials(person.name)}
            </text>
            <clipPath id={`relationship-face-${key}`}>
              <circle cx={p.x} cy={p.y} r={R} />
            </clipPath>
            <image
              href={person.photo}
              x={p.x - R}
              y={p.y - R}
              width={R * 2}
              height={R * 2}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#relationship-face-${key})`}
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={R}
              className="text-line"
              fill="none"
              stroke="currentColor"
            />
            <text
              x={p.x}
              y={p.y + 36}
              textAnchor="middle"
              fontSize={11.5}
              className="text-ink"
              fill="currentColor"
            >
              {firstName(person)}
            </text>
            <text
              x={p.x}
              y={p.y + 49}
              textAnchor="middle"
              fontSize={9.5}
              className="text-ink-muted"
              fill="currentColor"
            >
              {sub}
            </text>
          </g>
        )
      })}

      {/* The commitment: a pill, not a circle, so its kind is not carried by colour. */}
      <rect
        x={AT.loop.x - 54}
        y={AT.loop.y - 16}
        width={108}
        height={32}
        rx={16}
        className="text-surface"
        fill="currentColor"
      />
      <rect
        x={AT.loop.x - 54}
        y={AT.loop.y - 16}
        width={108}
        height={32}
        rx={16}
        className="text-accent-wash"
        fill="currentColor"
      />
      <rect
        x={AT.loop.x - 54}
        y={AT.loop.y - 16}
        width={108}
        height={32}
        rx={16}
        className="text-accent-graphic"
        fill="none"
        stroke="currentColor"
      />
      <text
        x={AT.loop.x}
        y={AT.loop.y - 1}
        textAnchor="middle"
        fontSize={10.5}
        className="text-ink"
        fill="currentColor"
      >
        Adoption breakdown
      </text>
      <text
        x={AT.loop.x}
        y={AT.loop.y + 10.5}
        textAnchor="middle"
        fontSize={9}
        className="text-accent"
        fill="currentColor"
      >
        for {firstName(ELENA)}
      </text>
    </svg>
  )
}

function Row({
  icon: Icon,
  label,
  text,
  basis,
  accent = false,
}: {
  icon: typeof CalendarCheck
  label: string
  text: string
  basis: string
  accent?: boolean
}) {
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <Icon
        className={
          accent ? 'text-accent mt-0.5 size-4 shrink-0' : 'text-ink-muted mt-0.5 size-4 shrink-0'
        }
      />
      <span className="min-w-0">
        <span className={accent ? 'label text-accent block' : 'label block'}>{label}</span>
        <span className="text-ink mt-1 block text-[0.875rem] leading-snug">{text}</span>
        <span className="text-ink-muted mt-0.5 block text-xs">{basis}</span>
      </span>
    </li>
  )
}

export function RelationshipVisual({ className }: { className?: string }) {
  return (
    <ProductFrame
      className={className}
      bodyClassName="grid md:grid-cols-[1.1fr_1fr]"
      description={`${brand.name}'s view of your relationships. A map shows you at the centre: four meetings with ${ELENA.name} of ${ELENA.org}, two conversations with ${THEO.name}, also of ${THEO.org}, and ${NADIA.name} of ${NADIA.org}, who introduced you to Elena. Last time, at the pilot review on September 18, Elena asked to see adoption by team before expanding, from your notes. Nadia introduced you to Elena, from your records. You owe Elena the adoption breakdown, due today. You are waiting on Theo for the budget code.`}
    >
      <div className="bg-bg-sunken border-line border-b px-3 py-4 sm:px-6 md:border-r md:border-b-0">
        <div className="mb-1 flex items-center gap-2.5 px-2">
          <Avatar name={ELENA.name} src={ELENA.photo} size="sm" />
          <p className="text-ink-secondary text-xs">
            {ELENA.name} · {ELENA.role}
          </p>
        </div>
        <ConnectionMap />
      </div>
      <ul className="divide-line divide-y px-5 py-5 sm:px-6">
        <Row
          icon={CalendarCheck}
          label="Last time · Pilot review, Sep 18"
          text="Elena asked to see adoption by team before expanding."
          basis="From your notes"
        />
        <Row
          icon={Handshake}
          label="Connected through"
          text="Nadia introduced you to Elena."
          basis="From your records"
        />
        <Row
          icon={DIRECTION_ICON.owe}
          label={DIRECTION_META.owe.label}
          text="Adoption breakdown for Elena"
          basis="Due today"
          accent
        />
        <Row
          icon={DIRECTION_ICON.waiting}
          label={DIRECTION_META.waiting.label}
          text="Budget code from Theo"
          basis="Asked Thursday"
        />
      </ul>
    </ProductFrame>
  )
}
