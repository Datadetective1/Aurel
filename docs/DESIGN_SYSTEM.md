# Design system

## Two themes, both first-class

**Pearl** — warm ivory, editorial, reads like paper
**Obsidian** — graphite, easier at night

Neither is the default the other degrades from. Every screen is reviewed in
both. The E2E suite asserts they produce different backgrounds and that neither
body is transparent.

Tokens are CSS custom properties on `:root` and `.dark`. Nothing in the app
references a raw colour — components use `bg-surface`, `text-ink-muted`,
`border-line`, and the theme decides.

## One accent

Brass. Used as a *marker*: an icon, a rule terminator, a selected state, a
single number. Never a flood fill.

Primary actions are high-contrast ink, not brass. That is deliberate and it is
what keeps the brass reading as precious rather than as a button colour. A
brass-filled primary button spends the one colour the brand has on a rectangle.

## Type

Instrument Serif for display, Instrument Sans for everything else. Serif appears
at headline sizes and for single significant numbers — `01 / 24` in the
assessment, a plan name, a count. It is a voice, not a decoration, and it stops
carrying meaning the moment it appears at body size.

## Contrast

`--ink-secondary` ~8.2:1, `--ink-muted` ~5.4:1 on the page background.
`--ink-faint` is ~3.5:1 and is restricted to decorative and large text — it is
never the only carrier of information.

Status colour is always paired with an icon or a word. Colour alone never
carries meaning.

## The Aperture

An arch. Three concentric strokes in the app, where it has room to read as
architecture.

**It was removed from the marketing hero.** At viewport scale the field of
arches read first as a rainbow, then as vertical stripes — never as the mark. In
transactional email it is a *single* arch for the same reason: at 20px in a mail
header three parallel strokes read as a barcode.

Restraint was the more expensive choice both times, and the right one. A motif
that does not read is worse than no motif.

## Motion

Sparing. Transitions are 150ms and colour-only in most places. Nothing
slides, bounces, or announces itself.

`usePrefersReducedMotion()` (via `useSyncExternalStore`, so it is
hydration-safe) and a global `prefers-reduced-motion` block cover both the
CSS and JS paths, including custom keyframes.

## Layout

Hairlines, not shadows. There is exactly one elevation utility (`.elevate`) and
it is barely visible. Luxury in this system reads as precise alignment and
generous whitespace, not as depth.

Horizontal rails — the settings nav, tab rows — hide their scrollbar and use the
clipped item at the edge as the affordance. `min-w-0` on the container is
load-bearing: a grid item defaults to `min-width: auto`, so a scrolling row will
otherwise widen its column and scroll the entire page sideways.

## Components

Semantics come from the platform. `OptionCard` renders a real radio or checkbox
underneath, so keyboard navigation, grouping and screen-reader behaviour are
inherited rather than reconstructed with ARIA. `FormField` wires
`aria-describedby` and `aria-invalid` for every field, which is what keeps forms
accessible by default instead of by remembering.

Touch targets on interactive controls are at least 44px.

## Naming

Every user-visible brand string lives in `src/lib/brand/index.ts`. A test fails
the build if the product name is hard-coded anywhere else, which is what made
the Aurel → Atturel rename a one-file change.
