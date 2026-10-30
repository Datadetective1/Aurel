import * as React from 'react'
import { AccessibilityInfo, Pressable, ScrollView, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { brand } from '@atturel/web/lib/brand'
import { Avatar, FaceStack } from './avatar'
import { Button } from './button'
import { T } from './text'
import { fonts, TOUCH, useTheme } from '~/theme'

/**
 * HOW ATTUREL WORKS
 * =============================================================================
 * Four short pages, shown once on a new install and again from Account. Each
 * says one thing Atturel does for you and shows it with the product's own
 * pieces, drawn with the sample people. The second page says plainly what to
 * enter for a good result, because the first testers added a first name only
 * and then wondered why Atturel knew nothing.
 *
 * Skippable from every page. The drawings are decorative; the words carry the
 * meaning, so VoiceOver reads the words and skips the pictures.
 * =============================================================================
 */

type Page = {
  eyebrow: string
  title: string
  body: string
  Art: () => React.ReactElement
}

export const INTRO_PAGES: Page[] = [
  {
    eyebrow: 'What it does',
    title: 'Walk into every meeting knowing the room.',
    body: `Before you meet someone, ${brand.name} writes you a one-page brief: who they are, what they care about, what you promised, and what to ask.`,
    Art: BriefArt,
  },
  {
    eyebrow: 'Start with a person',
    title: 'Give it a full name and a company.',
    body: `${brand.name} looks them up in public sources and you confirm each page. A first name alone is not enough to find anyone. For someone with little online, add a few notes yourself.`,
    Art: PersonArt,
  },
  {
    eyebrow: 'After the meeting',
    title: 'Capture what was said.',
    body: `Record the conversation or type a quick debrief. ${brand.name} turns it into notes and follow-ups, and keeps nothing until you review it.`,
    Art: CaptureArt,
  },
  {
    eyebrow: 'Over time',
    title: 'Every meeting makes the next one sharper.',
    body: `${brand.name} remembers what you learn and what you owe, so the next brief starts from everything you already know.`,
    Art: MemoryArt,
  },
]

export function Intro({ onDone, replay = false }: { onDone: () => void; replay?: boolean }) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const scroller = React.useRef<ScrollView>(null)
  const [page, setPage] = React.useState(0)
  const [calm, setCalm] = React.useState(false)
  const [height, setHeight] = React.useState(0)
  const last = page === INTRO_PAGES.length - 1

  React.useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(setCalm)
      .catch(() => {})
  }, [])

  const go = (next: number) => {
    setPage(next)
    scroller.current?.scrollTo({ x: next * width, animated: !calm })
  }
  const settled = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1))
    if (next !== page) setPage(Math.max(0, Math.min(INTRO_PAGES.length - 1, next)))
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, minHeight: TOUCH }}>
        <Wordmark />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={replay ? 'Close' : 'Skip the introduction'}
          onPress={onDone}
          hitSlop={8}
          style={({ pressed }) => ({ minHeight: TOUCH, minWidth: TOUCH, alignItems: 'flex-end', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <T variant="small" tone="secondary" style={{ fontFamily: fonts.sansMedium }}>{replay ? 'Close' : 'Skip'}</T>
        </Pressable>
      </View>

      <View style={{ flex: 1 }} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={settled}
          style={{ flex: 1 }}
        >
          {INTRO_PAGES.map((p, i) => (
            // Each page scrolls on its own, so large text never pushes the words off a small iPhone.
            <ScrollView
              key={p.title}
              style={{ width, height: height || undefined }}
              contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, justifyContent: 'space-between' }}
              showsVerticalScrollIndicator={false}
              accessibilityElementsHidden={i !== page}
              importantForAccessibility={i === page ? 'auto' : 'no-hide-descendants'}
            >
              <View style={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 16 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <p.Art />
              </View>
              <View style={{ paddingBottom: 8 }}>
                <T variant="label" tone="accent">{p.eyebrow}</T>
                <T variant="display" style={{ marginTop: 10 }} accessibilityRole="header">{p.title}</T>
                <T variant="body" tone="secondary" style={{ marginTop: 10 }}>{p.body}</T>
              </View>
            </ScrollView>
          ))}
        </ScrollView>
      </View>

      <View style={{ paddingHorizontal: 24, gap: 16, marginTop: 12 }}>
        <View
          style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Page ${page + 1} of ${INTRO_PAGES.length}`}
        >
          {INTRO_PAGES.map((p, i) => (
            <View key={p.title} style={{ width: i === page ? 22 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? c.accentGraphic : c.lineStrong }} />
          ))}
        </View>
        <Button
          label={last ? (replay ? 'Done' : 'Get started') : 'Next'}
          icon={last ? 'check' : 'arrow-right'}
          size="lg"
          onPress={() => (last ? onDone() : go(page + 1))}
        />
      </View>
    </View>
  )
}

/** The name, set in the display face, with the arch's single brass stroke. */
function Wordmark() {
  const { c } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessible accessibilityRole="header" accessibilityLabel={brand.name}>
      <View style={{ width: 16, height: 20, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: 2, borderBottomWidth: 0, borderColor: c.accentGraphic }} />
      <T variant="title" style={{ fontSize: 20, lineHeight: 24 }}>{brand.name}</T>
    </View>
  )
}

// --- the drawings -------------------------------------------------------------
// Built from the app's own surfaces and type, so they read as the product.

const MAYA = '/demo/faces/maya.webp'
const SAMPLE = [
  { id: 'maya', name: 'Maya Chen', src: MAYA },
  { id: 'daniel', name: 'Daniel Brooks', src: '/demo/faces/daniel.webp' },
  { id: 'priya', name: 'Priya Shah', src: '/demo/faces/priya.webp' },
  { id: 'lucas', name: 'Lucas Martin', src: '/demo/faces/lucas.webp' },
  { id: 'elena', name: 'Elena Torres', src: '/demo/faces/elena.webp' },
]

function Sheet({ children, tilt = 0 }: { children: React.ReactNode; tilt?: number }) {
  const { c } = useTheme()
  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: 18,
        padding: 18,
        transform: [{ rotate: `${tilt}deg` }],
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      }}
    >
      {children}
    </View>
  )
}

function Line({ icon, text, tone = 'ink' }: { icon: React.ComponentProps<typeof Feather>['name']; text: string; tone?: 'ink' | 'muted' }) {
  const { c } = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 12 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.accentWash, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={13} color={c.accent} />
      </View>
      <T variant="small" tone={tone === 'muted' ? 'muted' : 'ink'} style={{ flex: 1, marginTop: 3 }}>{text}</T>
    </View>
  )
}

function BriefArt() {
  const { c } = useTheme()
  return (
    <Sheet tilt={-1.5}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name="Maya Chen" src={MAYA} size={52} />
        <View style={{ flex: 1 }}>
          <T variant="title" style={{ fontSize: 19, lineHeight: 23 }}>Maya Chen</T>
          <T variant="meta" tone="muted">VP Engineering · Northwind</T>
        </View>
        <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: c.bgSunken }}>
          <T variant="meta" tone="secondary">Thu 10:00</T>
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: c.line, marginTop: 14 }} />
      <Line icon="target" text="Wants utilization data before any headcount move" />
      <Line icon="corner-up-right" text="You owe her the Q3 numbers" />
      <Line icon="help-circle" text="Ask what would change her mind" />
    </Sheet>
  )
}

function FakeField({ label, value }: { label: string; value: string }) {
  const { c } = useTheme()
  return (
    <View style={{ marginTop: 10 }}>
      <T variant="meta" tone="muted">{label}</T>
      <View style={{ marginTop: 4, borderWidth: 1, borderColor: c.lineStrong, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.bg }}>
        <T variant="body">{value}</T>
      </View>
    </View>
  )
}

function PersonArt() {
  const { c } = useTheme()
  return (
    <Sheet tilt={1.2}>
      <T variant="label" tone="muted">Someone new</T>
      <FakeField label="Full name" value="Maya Chen" />
      <FakeField label="Company" value="Northwind" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, padding: 10, borderRadius: 10, backgroundColor: c.positiveWash }}>
        <Feather name="check-circle" size={15} color={c.positiveStrong} />
        <T variant="small" tone="positive" style={{ flex: 1 }}>4 public pages found. You confirm each one.</T>
      </View>
      <Line icon="edit-3" text="Little online? Add what you know." tone="muted" />
    </Sheet>
  )
}

function CaptureArt() {
  const { c } = useTheme()
  const bars = [10, 22, 34, 18, 40, 28, 14, 30, 44, 24, 12, 26, 36, 16, 8]
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.surfaceInverse, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="mic" size={26} color={c.inkInverse} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 48 }}>
          {bars.map((h, i) => (
            <View key={i} style={{ width: 4, height: h, borderRadius: 2, backgroundColor: i < 9 ? c.accentGraphic : c.lineStrong }} />
          ))}
        </View>
      </View>
      <Sheet tilt={-1}>
        <T variant="label" tone="muted">Ready to review</T>
        <Check text="Send Daniel the budget draft by Friday" on />
        <Check text="Priya shares the risk register" on />
        <Check text="Maya prefers numbers before opinions" />
      </Sheet>
    </View>
  )
}

function Check({ text, on = false }: { text: string; on?: boolean }) {
  const { c } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
      <Feather name={on ? 'check-square' : 'square'} size={18} color={on ? c.ink : c.lineStrong} />
      <T variant="small" style={{ flex: 1 }}>{text}</T>
    </View>
  )
}

function MemoryArt() {
  const { c } = useTheme()
  return (
    <View style={{ gap: 18, alignItems: 'center' }}>
      <FaceStack people={SAMPLE} size={52} max={5} />
      <View style={{ alignSelf: 'stretch' }}>
        <Sheet tilt={1}>
          <Loop who="You owe" what="Daniel the budget draft" icon="arrow-up-right" tone={c.cautionStrong} />
          <View style={{ height: 1, backgroundColor: c.line, marginTop: 12 }} />
          <Loop who="Owed to you" what="Priya's risk register" icon="arrow-down-left" tone={c.info} />
        </Sheet>
      </View>
    </View>
  )
}

function Loop({ who, what, icon, tone }: { who: string; what: string; icon: React.ComponentProps<typeof Feather>['name']; tone: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
      <Feather name={icon} size={16} color={tone} />
      <View style={{ flex: 1 }}>
        <T variant="meta" style={{ color: tone, fontFamily: fonts.sansMedium }}>{who}</T>
        <T variant="small">{what}</T>
      </View>
    </View>
  )
}
