# Atturel brand assets

Social and press assets, generated from the production brand. Nothing in this
folder is a new design: the arches are the product component's own path data,
the colours are the CSS custom properties the site ships, and the wordmark is
the same Instrument Serif the site loads, outlined at export time.

If the site changes, regenerate rather than editing an export:

```bash
node scripts/brand/fetch-fonts.mjs        # once — pulls the OFL fonts to .brandtmp/
node scripts/brand/build-brand-assets.mjs # rewrites everything here
node scripts/brand/verify-brand-assets.mjs
```

---

## Source files

| What | Where it lives | Notes |
| --- | --- | --- |
| Logomark geometry | `src/components/brand/aperture.tsx` → `ApertureMark` | Three strokes on a 24-unit grid. The only original vector source for the mark. |
| Square app icon | `public/icon.svg` | The official square icon. Deliberately *not* the same geometry as `ApertureMark` — it springs higher and sits on a 19 baseline so it survives a rounded corner. Copied here verbatim as `logo/atturel-app-icon-source.svg`. |
| Wordmark | `src/components/brand/aperture.tsx` → `Wordmark` | Live text, not a vector file. The lockup here reproduces its layout (`items-center`, mark and name both `1.15em`, `tracking-[-0.01em]`). |
| Colour tokens | `src/app/globals.css` (`:root` and `.dark`) | |
| Type | `src/app/layout.tsx` (`next/font`) | Instrument Sans + Instrument Serif |
| Copy | `src/lib/brand/index.ts`, `src/app/(marketing)/page.tsx` | |

There was no existing logo file to export from — the mark lives as JSX and the
wordmark as a font. Everything here is generated from those two sources, which
is why the generator is committed alongside the output.

---

## Primary logo

**`logo/atturel-logo-primary-{pearl,obsidian}.svg`** — mark plus wordmark,
transparent, text outlined so it renders identically on a machine that has
never had Instrument Serif installed.

Use the full lockup wherever it fits. Use the mark alone only where the lockup
would fall below its minimum size — a profile avatar, a favicon, an app tile.

### Variants

| File | Use |
| --- | --- |
| `atturel-logo-primary-pearl.svg` / `-1600x361.png` | On light surfaces. Ink `#1a1815`, mark `#856427`. |
| `atturel-logo-primary-obsidian.svg` / `-1600x361.png` | On dark surfaces. Ink `#f2efe9`, mark `#d9b074`. |
| `atturel-mark-{pearl,obsidian}.svg` / `-512.png` | Mark alone, transparent. |
| `atturel-app-icon-source.svg` | The official square icon, unmodified. |
| `atturel-app-icon-{1024,512,180,32}.png` | Rasterised from that source. 180 is the Apple touch icon size; 32 the favicon. |

The two themes are not interchangeable. The brass differs between them on
purpose: `#856427` is the value that clears AA on Pearl, `#d9b074` the value
that clears it on Obsidian. Putting the Obsidian mark on a light background
gives you a pale gold that fails contrast.

---

## Colour

Pulled from `globals.css`. These are the only colours any asset here contains,
and `verify-brand-assets.mjs` fails the build if a stray one appears.

### Pearl (light)

| Token | Hex | Use |
| --- | --- | --- |
| `--bg` | `#fbf9f6` | Page ground |
| `--ink` | `#1a1815` | Headlines |
| `--ink-secondary` | `#4a4741` | Supporting line |
| `--ink-muted` | `#6b6862` | Eyebrow, domain |
| `--accent` | `#856427` | The mark |
| `--accent-graphic` | `#b5893f` | Rules and motif strokes |

### Obsidian (dark)

| Token | Hex | Use |
| --- | --- | --- |
| `--bg` | `#0d0d0f` | Page ground |
| `--ink` | `#f2efe9` | Headlines |
| `--ink-secondary` | `#b4b0a8` | Supporting line |
| `--ink-muted` | `#9b978f` | Eyebrow, domain |
| `--accent` | `#d9b074` | The mark |
| `--accent-graphic` | `#d9b074` | Rules and motif strokes |

One accent. Brass appears once per composition — the mark, or a single rule,
not both competing.

---

## Type

- **Instrument Serif** — display only. Headlines, the wordmark, single
  significant numbers.
- **Instrument Sans** — everything else. Eyebrows at weight 500, supporting text
  at 400.

Both are OFL and loaded by the site through `next/font`. No other face appears
in any asset here.

The eyebrow treatment is the site's `.label` class: uppercase, `0.14em`
tracking, weight 500, in `--ink-muted`.

---

## Clear space and minimum size

**Clear space:** keep free space equal to **half the mark's height** on every
side of the lockup. It is derived from the artwork rather than invented, so it
scales with whatever size you place.

**Minimum size:** the mark is drawn to stay legible down to **16px** — that
figure is from the component's own note, not a guess. In practice:

- Mark alone: no smaller than **16px**.
- Full lockup: no narrower than **88px**, which puts the mark at about 20px.

Below that the inner arch and the vanishing line merge into a single blur and
the mark stops being the mark. Use the standalone mark instead.

---

## Pearl or Obsidian

Obsidian is the recommended primary for social. The mark reads with more
authority on it, brass is at its best on a dark ground, and it is more
distinctive in a feed that is overwhelmingly white.

Pearl is the better choice when the asset sits next to the product's own light
UI, in a press kit that will be printed, or anywhere a dark block would read as
a hole in the page.

Both are complete and correct. Pick one per surface and stay with it — a Pearl
banner above an Obsidian avatar looks like two companies.

---

## Social banner guidance

Both banners use the same composition on purpose: one arch, with the wordmark
and positioning line standing inside it. LinkedIn and X should read as the same
company, not two interpretations of it.

- **LinkedIn cover** is 6:1 and gets cropped hard on narrow viewports. All
  content sits in the central band; the outer quarter on each side is
  deliberately empty and is checked by the verifier.
- **X header** keeps the lower-left clear, because the avatar and its ring sit
  on top of that corner. The block is centred on the space that remains, not on
  the raw canvas.
- Do not add a feature list, a screenshot, or a call to action. The banner
  carries the name and one line.

### Why PNG and not JPEG

Every composition here is a flat field crossed by hairline strokes, which is the
exact content JPEG handles worst — chroma subsampling frays a 2px brass rule and
ringing haloes the arches. The largest file in this folder is 79kb, so there is
nothing to buy by trading that away.

---

## The motif at scale

The aperture is three concentric arches in the app, where it has room to read as
architecture. It does not survive being enlarged naively: past a certain size
the concentric strokes stop reading as a threshold and read as vertical stripes.
`docs/DESIGN_SYSTEM.md` records the motif being pulled from the marketing hero
for this reason and reduced to a single arch in email.

So these assets use it two ways only:

- **One wide arch**, on the banners, with content standing inside it.
- **The logomark itself, enlarged and faint**, on the posters — drawn at a
  thinner stroke than the mark uses, because scaling a hairline uniformly turns
  it into a slab.

Do not build a field of arches. It has been tried twice and it fails the same
way both times.

---

## Prohibited treatments

- **Stretching or squashing.** The lockup has one aspect ratio. Scale it
  proportionally or not at all.
- **Recolouring** outside the tokens above. No brand-adjacent gold, no black
  where ink is specified.
- **Effects** — drop shadows, glows, bevels, outer strokes, blurs.
- **Gradients** anywhere, including on the mark.
- **Rotating** the mark or the lockup. The arch stands on its baseline.
- **Rearranging the lockup** — moving the mark above or after the name, changing
  the gap, setting the name in another face, or using the name without its
  tracking.
- **Busy backgrounds.** The mark is a hairline drawing; it disappears on
  photography and pattern. Place it on a flat brand ground.
- **Reconstructing the mark by hand** or tracing it from a screenshot. Use the
  files here, or regenerate them.

---

## Files

```
brand/
  logo/       primary lockup (SVG + PNG), standalone mark, app icons
  linkedin/   company logo 400x400, cover 4200x700 (Pearl + Obsidian)
  x/          profile 400x400, header 1500x500 (Pearl + Obsidian)
  social/     OG 1200x630, square 1080x1080, portrait 1080x1350,
              announcement 1200x627 — each in Pearl and Obsidian
```

29 files, 0.86mb total.

The four `social/` sizes are **templates**, not campaign posts. They carry the
wordmark, the positioning line and the domain; swap the headline by editing
`COPY` in `scripts/brand/lib/brand-source.mjs` and re-running the generator.
