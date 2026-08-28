# Handoff: Nyx Audio — personal lossless music library

## Overview

Nyx Audio is a private music client for a personal FLAC collection served by **Navidrome (OpenSubsonic API)** running on a Raspberry Pi 5. The Pi stores and serves; it never plays. Audio comes out of whatever device the user is holding.

There is exactly one user. The library is finite (~56 albums in the mock data, 641 tracks) and every record in it was deliberately chosen. **The interface's job is not algorithmic discovery — it is making an already-loved collection feel present, browsable and physically real.**

The design thesis, which governs every decision below: **the interface is a frame for the artwork, not a competitor to it.** Chrome recedes to hairlines and mono labels. Album art is the largest, brightest, most saturated thing on nearly every surface. When a record plays, the room takes that record's colour.

Enrichment sources: **LRCLIB** (lyrics), **MusicBrainz** (genre, release context, biography), **ListenBrainz** (optional), and a **local play-history store** (statistics). All enrichment is network-dependent and must degrade to designed absent states.

---

## About the design files

The files in `prototype/` are **design references authored in HTML** — a working prototype showing intended look and behaviour. They are **not production code to copy**.

Your task is to **recreate these designs in the target codebase's own environment** — React, Vue, Svelte, SwiftUI, Flutter, whatever exists — using its established patterns, routing, state management and component library. If no codebase exists yet, choose the framework appropriate to the platform and implement the designs there.

Two specific notes:

- The prototype is a single-file component using a bespoke streaming-template runtime (`support.js`). **Ignore that runtime entirely.** It is a authoring convenience, not an architectural recommendation. Read the prototype for layout, spacing, copy and behaviour; discard its structure.
- All styling in the prototype is inline. That is a constraint of the authoring format, **not** a recommendation. In production use whatever the codebase uses — CSS modules, Tailwind, styled-components, Flutter `ThemeData`. The canonical values live in `tokens/nyx-tokens.css`, which is written to be portable.

## Fidelity

**High-fidelity.** Colours, type scale, spacing, radii, motion durations and copy are all final and intentional. Recreate them precisely. Where this document and the prototype disagree, **this document and `nyx-tokens.css` win** — a few prototype values are approximations forced by the authoring format.

Two things are explicitly *not* final and are flagged inline below: procedurally-generated cover art (a stand-in for real artwork) and the ambient level meters (currently pseudo-random, should be driven by real audio analysis or removed).

---

## Platform targets

One design system covers three targets. Decide all three now; do not redesign later.

| Target | Range | Shell |
|---|---|---|
| Desktop / web | 1280–2560px | Sidebar nav, dense content, persistent bottom player bar, ⌘K palette |
| Tablet | 768–1024px | Sidebar collapses to 64px icon rail; grid drops to 3–4 columns |
| Mobile (Flutter, later) | 375–430px | Bottom tab bar, docked mini-player, drag-to-expand Now Playing |

Desktop density is a **feature**. A collection is meant to be surveyed; show a lot at once.

---

## Design tokens

Full canonical source with Flutter mapping notes: **`tokens/nyx-tokens.css`**. Summary follows.

### Colour — neutrals

The neutral scale is a **warm brown-black at low chroma (hue 46–52)**, not a cold grey and not `#1a1a1a`. Text runs warmer still (hue 62–80) so it reads as ink rather than glare. This was chosen, not defaulted to.

All values are OKLCH. Convert as needed; keep the L and C relationships.

**Night (primary theme — this gets the best of the design):**

| Token | Value | Use |
|---|---|---|
| `--nyx-bg-0` | `oklch(0.168 0.022 52)` | App background |
| `--nyx-bg-1` | `oklch(0.212 0.026 48)` | Sidebar, player bar, cards, queue panel |
| `--nyx-bg-2` | `oklch(0.256 0.030 46)` | Hover, selected nav, active chip |
| `--nyx-bg-3` | `oklch(0.318 0.034 44)` | Scrubber groove, meter track, scrollbar |
| `--nyx-line` | `oklch(0.360 0.034 44)` | 1px structural rules, button borders |
| `--nyx-line-soft` | `oklch(0.278 0.026 46)` | List separators |
| `--nyx-txt-1` | `oklch(0.965 0.022 80)` | Primary text — ≥13:1 on bg-0 |
| `--nyx-txt-2` | `oklch(0.800 0.030 70)` | Secondary — ≥7:1 |
| `--nyx-txt-3` | `oklch(0.650 0.034 62)` | Mono readouts, labels — ≥4.6:1 |

**Day (genuinely designed, not an inversion).** Warm paper (hue 74–78) under warm brown-black ink (hue 48–56) — a printed sleeve under an afternoon lamp:

| Token | Value |
|---|---|
| `--nyx-bg-0` | `oklch(0.968 0.019 78)` |
| `--nyx-bg-1` | `oklch(0.940 0.024 76)` |
| `--nyx-bg-2` | `oklch(0.905 0.029 74)` |
| `--nyx-bg-3` | `oklch(0.862 0.034 70)` |
| `--nyx-line` | `oklch(0.838 0.032 68)` |
| `--nyx-line-soft` | `oklch(0.892 0.026 74)` |
| `--nyx-txt-1` | `oklch(0.245 0.026 48)` |
| `--nyx-txt-2` | `oklch(0.445 0.029 52)` |
| `--nyx-txt-3` | `oklch(0.578 0.031 56)` |

### Colour — fixed semantic accents

Same lightness and chroma, hue varies. **Never derived from artwork** — these must mean the same thing on every record.

| Token | Night | Day | Use |
|---|---|---|---|
| `--nyx-signal` | `oklch(0.780 0.098 68)` | `oklch(0.520 0.110 58)` | Focus ring, interactive, chart ink |
| `--nyx-positive` | `oklch(0.760 0.095 148)` | `oklch(0.495 0.100 148)` | Connected, healthy |
| `--nyx-warning` | `oklch(0.800 0.105 88)` | `oklch(0.560 0.110 78)` | Scanning, offline, degraded |
| `--nyx-negative` | `oklch(0.690 0.130 28)` | `oklch(0.520 0.150 28)` | Server unreachable, errors |

### Colour — the dynamic palette (the centrepiece, and the biggest risk)

This is the visual thesis. Specify it exactly as written; the contrast guarantee depends on every step.

**Extraction.** Downsample the cover to 64×64. k-means in OKLab. Take **five** swatches: dominant, secondary, dark-muted, light-muted, most-vivid.

**Rewriting — the critical step.** Never use an extracted colour raw. For each swatch:

1. **Hue** — keep from the artwork.
2. **Chroma** — `min(extracted_C × strength, ceiling)`, where ceiling is **0.09 for surfaces** and **0.13 for accents** (progress fill, glow, active lyric). `strength` is the user's "artwork drives the palette" setting, 0–100%, default 70.
3. **Lightness** — **discard the extracted value entirely** and pin to fixed rungs (below).

Because L is pinned and the text tokens never move, **contrast is a structural property of the system, not a hope**. AA holds identically for a black-and-white photograph, a neon rave sleeve and a beige ECM cover. This is the answer to "how do you keep AA when the palette is artwork-driven": you don't let the artwork touch lightness.

**Lightness rungs:**

| Role | Night L | Day L | C ceiling |
|---|---|---|---|
| `art-wash` — ambient background | 0.300 | 0.900 | 0.09 |
| `art-deep` — Now Playing floor | 0.185 | 0.955 | 0.05 |
| `art-glow` — glow behind sleeve | 0.460 | 0.820 | 0.13 |
| `art-bar` — progress fill | 0.760 | 0.520 | 0.13 |
| `art-lyric` — active lyric line | 0.920 | 0.360 | 0.06 |

**Fallback.** If extraction fails, or the image is achromatic (C < 0.01), use **hue 58** — the warm neutral bias. The UI simply looks like itself.

**Where extracted colour is ALLOWED:** ambient background washes, the glow behind artwork, the progress bar fill, the active lyric line, genre tiles, the crate card bleed, listening-year chapter grounds.

**Where it is FORBIDDEN:** body text, any icon, the focus ring, semantic states, chart ink, anything the user reads under time pressure. No exceptions.

**Transition.** On track change, crossfade wash / deep / glow / bar / lyric over **620ms** with `cubic-bezier(0.2, 0.7, 0.2, 1)`, simultaneously with the artwork crossfade. This is one of only four motion moments in the product; make it count.

### Typography

Three roles, warm throughout. Google Fonts is the one permitted runtime external — **bundle the files locally anyway**, since the Pi may be offline, and keep the fallback stacks.

| Role | Family | Fallback stack |
|---|---|---|
| Display — album, artist, track, headings, lyrics, editorial | **Literata** (300–600) | `Georgia, 'Iowan Old Style', 'Times New Roman', serif` |
| Body — UI, lists, buttons | **Alegreya Sans** (400/500/700) | `'Gill Sans', 'Trebuchet MS', Helvetica, sans-serif` |
| Mono — technical readouts, timecodes, counts, statistics, all labels | **IBM Plex Mono** (400/500) | `ui-monospace, 'SF Mono', Menlo, Consolas, monospace` |

Explicitly excluded: Inter, Space Grotesk.

**Tabular numerals are mandatory** wherever digits align — durations, play counts, timecodes, stats, the listening clock. CSS `font-variant-numeric: tabular-nums`; Flutter `FontFeature.tabularFigures()`.

**Scale (px):**

| Token | Size | Use |
|---|---|---|
| mono-xs | 9.5 | Eyebrow labels, `letter-spacing: 0.2em`, uppercase |
| mono-sm | 10.5 | Signal path, timecodes, counts, provenance |
| mono-md | 11.5 | Crate reason line |
| body-sm | 11.5 | Secondary list text |
| body-md | 14.5 | Default UI text |
| body-lg | 15.5 | Base font size (Alegreya Sans has a small x-height — the ladder sits ~1px larger than a grotesque needs) |
| disp-sm | 17 | Playlist names, small headings |
| disp-md | 22 | Genre tiles |
| disp-lg | 34 | Screen titles |
| disp-xl | 46 | Album title (medium) |
| disp-2xl | 58 | Album title (short) |
| lyric | 34 active / 29 inactive desktop; 24 / 21 mobile | Synced lyrics |
| ambient | `clamp(44px, 5.4vw, 84px)` | Ambient display title |

Line heights: tight 1.06 (display), body 1.5, reading 1.7. Letter spacing: mono 0.08em, eyebrow 0.2em, display −0.015em.

**Long-title handling (important — classical and Indian classical break naive layouts).** No marquee, ever. Two mechanisms:

1. **Size step-down by character count** on album titles: >60 chars → drop `disp-xl`→`disp-lg` (mobile 26px); >30 chars → `disp-2xl`→`disp-xl`; else `disp-2xl`. This is pure logic and ports to Flutter directly.
2. **Ellipsis + full title one tap away.** Player-bar and list titles get `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`. The complete title is always readable on Now Playing or album detail.

Body copy and titles use `text-wrap: pretty` on web. Flutter has no equivalent — the size step-down covers it.

Test strings that must render gracefully at every breakpoint:

- `Symphony No. 9 in D minor, Op. 125 "Choral": IV. Presto — Allegro assai — Rezitativ`
- `Raga Yaman: Alap, Jod, Jhala — Vilambit Teentaal`
- `The Disintegration Loops I–IV: Complete Recordings of the Original Tape Transfers, 2001` (86 chars)
- `Nigeria Soul Fever: Afro Funk, Disco and Boogie — Lagos and Beyond, 1974–1983`
- `Shivkumar Sharma · Hariprasad Chaurasia · Brij Bhushan Kabra`
- Diacritics: `Cesária Évora`, `Henryk Górecki`, `Ali Farka Touré`, `The Köln Concert`, `Amália Rodrigues`

### Spacing, radii, elevation

4px base: 4 / 8 / 12 / 16 / 20 / 26 / 34 / 44.
Screen padding: desktop `34px 40px 44px`; mobile `20px 16px 26px` plus safe-area bottom inset.

Radii are **deliberately small — records are not rounded**: sleeve 2px (always), micro controls 3px, buttons and cards 6px, overlays 10px, pills 999px.

One shadow family, tinted with the warm neutral:
- `e-1` `0 6px 18px oklch(0.12 0.012 48 / 0.35)` — grid sleeves
- `e-2` `0 24px 60px oklch(0.12 0.012 48 / 0.50)` — album detail sleeve
- `e-3` `0 30px 90px oklch(0.10 0.012 48 / 0.60)` — modals, crate card, Now Playing art

### Motion

**Four moments only. Everything else is instant.** Scattered micro-animation is what makes software feel generated rather than designed.

| Moment | Duration | Notes |
|---|---|---|
| Artwork + palette crossfade on track change | 620ms | Both properties together |
| Lyric line advance | 620ms | Opacity, colour, weight |
| Mini-player → full-screen Now Playing | 260ms | `translateY(100%)` → 0 |
| Crate card reveal | 620ms | Rise + fade |

Supporting: queue panel slide-in 260ms (`translateX(100%)`), sleeve flip 260ms, state changes 120ms, ambient drift 90s (48s in OLED-safe mode).

Easing: `cubic-bezier(0.2, 0.7, 0.2, 1)` throughout — Flutter `Curves.easeOutCubic` is close enough.

**`prefers-reduced-motion: reduce`** collapses all durations to 1ms and stops the ambient drift. Flutter: honour `MediaQuery.disableAnimations`.

### Iconography

A single coherent set, drawn as geometry (CSS borders/triangles in the prototype; use a real icon set in production — Lucide, Phosphor or equivalent, one family only). **No emoji anywhere in the interface**, including empty states and section markers.

Transport glyphs must carry proper `aria-label`s: Play, Pause, Previous track, Next track, Seek.

---

## Accessibility requirements — not optional

- **WCAG AA contrast holds even when the palette is artwork-driven.** Guaranteed structurally by the pinned-lightness rule above. Do not shortcut it.
- **Full keyboard control on desktop.** Complete map below; every interactive element reachable by Tab.
- **Focus ring:** `2px solid var(--nyx-signal)`, `outline-offset: 2px`, on `:focus-visible`. Never suppressed.
- **44pt minimum touch targets** on mobile; safe-area aware (bottom inset on tab bar, top inset on Now Playing).
- **`prefers-reduced-motion`** respected as specified.
- Transport controls, scrubber (`role="slider"`), search inputs and the command palette all carry explicit labels.
- Lyric lines are real buttons — keyboard-reachable, each seeks to its timestamp.

---

## Keyboard map (desktop)

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` `→` | Seek ∓5 seconds |
| `N` | Toggle Now Playing |
| `L` | Toggle lyrics |
| `F` | Flip the sleeve (album detail) |
| `Q` | Toggle queue panel |
| `⌘K` / `Ctrl+K` | Command palette |
| `/` | Search |
| `G` then `A` / `C` / `S` | Go to Albums / Crate / Statistics |
| `?` | Keyboard reference overlay |
| `Esc` | Close anything (palette, overlay, queue, Now Playing, ambient) |
| `D` | Ambient display |

---

## Shell

### Desktop shell
*Screenshot: `01-desktop-home-today.png`*

Three regions, no gaps:

1. **Sidebar — 232px fixed**, `bg-1`, 1px right border.
   - Wordmark block, 22px 18px 16px padding: `NYX` in Literata 26px, `letter-spacing: 0.14em`; beneath it a 1px rule and the mono word `AUDIO` at 9px / 0.22em.
   - Nav list, 8px horizontal padding, 1px gaps. Each row is `min-height: 36px`, 8px/10px padding, 6px radius, `display: flex; gap: 10px`, containing: a 20px mono 2-letter code in `txt-3`, the label at body-md, and a right-aligned **count** in mono 10.5px tabular. Active row: `txt-1` on `bg-2`. Inactive: `txt-2` on transparent.
   - Destinations and codes: `TD` Today, `AL` Albums (56), `AR` Artists (39), `GN` Genres (7), `PL` Playlists (7), `FV` Favourites (12), `CR` Crate, `ST` Statistics, `YR` Listening year (2026), `QU` Queue (n), `SE` Settings.
   - **The counts are the point.** They're how the user feels the edges of a finite collection. Always show them.
   - Footer, pinned, 1px top border, mono 10px: `56 albums · 641 tracks` / `41.2 GB · Pi 5 · navidrome` / a 5px `positive` dot + `connected · bit-perfect`.
   - **Collapsed variant:** 64px, icon rail, 2-letter mono codes only, counts hidden, labels as tooltips.

2. **Content region** — scrolls independently. Carries the artwork wash: a radial gradient `120% 70% at 15% 0%` from `art-wash` to transparent, `opacity: 0.4` normally and `0.95` on album detail and crate.

3. **Player bar — 78px fixed**, `bg-1`, 1px top border. **Use CSS Grid, not flex** — `grid-template-columns: minmax(190px,1fr) minmax(210px,620px) minmax(150px,1fr)`, 20px gap, 18px horizontal padding, `overflow: hidden`. (Flex negotiation crushes a column at narrow widths; the grid floors prevent it.)
   - **Left:** 56px sleeve + title (Literata 15px, ellipsised) + artist (11.5px `txt-2`, ellipsised). Whole cell is a button that expands Now Playing.
   - **Centre:** transport row (prev / 40px circular play-pause in `txt-1` on `bg-0` / next, 18px gaps, plus mono `SHUF` and `RPT` labels), then the scrubber row: elapsed (mono 10.5px tabular) — 3px groove in `bg-3` with `art-bar` fill — duration.
   - **Right:** signal path, right-aligned, mono 10px: `FLAC · 24 bit · 96 kHz · 2 304 kbps` in `txt-2`, then either `bit-perfect → 44.1 kHz out` or `→ resampled to 48 kHz by the browser mixer` in `txt-3`, then `QUEUE n` and `LYRICS` buttons.

**The signal path is a signature detail.** Real numbers, never an "HD" badge. Say so plainly when the browser is resampling. Small, quiet, always available, never shouted — the texture of good equipment.

### Mobile shell
*Screenshots: `35-mobile-home.png`, `28-mobile-albums.png`*

393×820 frame. No sidebar. Bottom stack, in order:

1. **Mini-player** — 8px/12px padding, 1px top border, `bg-1`: 44px sleeve, title (Literata 14px) + artist (11px `txt-3`), 44×44 play/pause. Tapping the row expands to full-screen Now Playing; tapping the button toggles playback (`stopPropagation`).
2. **2px progress line** in `art-bar` directly under it.
3. **Tab bar** — `6px 4px 22px` padding (bottom accounts for the home indicator), 1px top border. Five tabs, each `flex: 1`, `min-height: 48px`, stacked mono code over 10px label: `TD` Today, `AL` Albums, `SR` Search, `CR` Crate, `ST` Stats. Active: `txt-1` on `bg-2`.

**Drag-to-expand:** dragging the mini-player upward past ~35% of screen height commits to full-screen Now Playing; below that it springs back. Tap does the same instantly. Reverse gesture (drag down from the Now Playing header, or the ▾ CLOSE control) collapses. 260ms, `translateY`.

### Command palette (⌘K)
*Screenshot: `18-desktop-command-palette.png`*

Centred overlay, 12vh from top, `min(620px, 92vw)`, max 66vh, `bg-1`, 1px `line` border, 10px radius, `e-3` shadow, backdrop `oklch(0.14 0.01 268 / 0.72)`. Rises in over 260ms.

Header: mono `⌘K` + a borderless 16px input, autofocused, placeholder `Go to, play, or run…`. Results list, 8px padding, rows of `10px 12px` with 6px radius, hovering to `bg-2`. Each row: a 52px mono uppercase **kind** in `txt-3` (`GO` / `DO` / `PLAY`), the label, and a right-aligned mono hint (shortcut or year).

Sources, in order: every nav destination; actions (Play/Pause, Ambient display, Toggle lyrics, Switch theme); then all 56 albums as `Title · Artist`. Substring filter, cap at 9 visible.

### Keyboard reference (`?`)
*Screenshot: `19-desktop-keyboard-overlay.png`*

Centred, `min(760px, 94vw)`, `bg-1`, 1px border, 10px radius, 28px padding. Title in Literata 26px. Two-column auto-fit grid (min 240px), each row a bordered mono key cap (min 52px, centred, 3px radius) plus a 12.5px `txt-2` label.

### Queue panel
*Screenshots: `17-desktop-queue-panel.png`, `31-mobile-queue-panel.png`*

**A floating right-hand panel, not a screen** — reachable from anywhere without losing context.

- Desktop: 344px wide, absolutely positioned, `top: 0; right: 0; bottom: 78px` (above the player bar), `z-index: 35`, `bg-1`, 1px left border, `-24px 0 60px oklch(0.12 0.012 48 / 0.45)` shadow. Slides in from the right, 260ms.
- Mobile: full width, `bottom: 118px`.
- Opened by: sidebar `QU`, the player bar `QUEUE n` button, `Q`, ⌘K, or "Add to queue" on album detail. Closed by the × , `Q` or `Esc`.

Three sections in one scroll:
- **History** — previous two tracks, `opacity: 0.5`, 36px thumb + title + duration.
- **Now playing** — inset card on `art-deep` with a 2px left border in `art-bar`; 36px thumb, Literata 15px title, mono sub-line `Artist · FLAC · 24 bit · 96 kHz`, duration.
- **Up next** — numbered mono index, 36px thumb, title + artist, then three 28×28 controls: ↑ ↓ ×. Reordering is immediate and must not interrupt playback.

Footer: `Save as playlist` (fills the row) and `Clear`. Empty state, dashed border: `Nothing queued. Play a record and it fills from the album, in order.`

Header sub-line shows the **playing-from context**: `playing from Kind of Blue`.

---

## Screens

### 1. Home / Today
*Screenshots: `01-desktop-home-today.png`, `38-day-home.png`, `35-mobile-home.png`*

**Not a feed.** A finite, dated snapshot with edges.

Header: `Good evening` in Literata 300 at 34px; right-aligned mono stamp `22:14 · 28 aug 2026 · 56 albums on the shelf`. 1px rule beneath.

Sections, each with a mono 9.5px / 0.2em uppercase eyebrow:

- **Continue listening** — `repeat(auto-fill, minmax(230px, 1fr))`, 10px gaps. Cards: 1px `line-soft` border, 6px radius, `bg-1`, 8px padding, 56px sleeve + title/artist/`resume · 2:31 in`. Hover lifts border to `line` and background to `bg-2`.
- Then a two-column `auto-fit minmax(300px, 1fr)` region, 26px gap:
  - **Today's crate pick** — one wide card, 96px sleeve, title at 20px, and the reason in mono: `Bought eleven months ago. Played once, on 14 Sep 2024. Nothing has touched it since.` Opens crate mode.
  - **On this day** — three rows: mono year (38px column), title, right-aligned artist.
  - **Recently added** — `auto-fill minmax(84px, 1fr)` sleeve grid, 8 items, title beneath at 10.5px.
  - **Unplayed longest** — four rows, 36px thumb, title + artist, right-aligned mono age (`23 mo`, `1.9 y`, `never`).

**Responsive:** *reflows.* Columns collapse to one; the two-column region stacks. Same screen, narrower.

### 2. Albums
*Screenshots: `02-desktop-albums-grid.png`, `28-mobile-albums.png`*

The main grid. Artwork-led, dense, no hero.

Header: `Albums` at 34px + right-aligned mono `56 albums · 641 tracks · 41.2 GB · library complete`.

Control row, 16px above / 14px below, 1px bottom rule. Pill chips (`6px 11px`, `min-height: 32px`, 999px radius, mono 10px uppercase 0.08em; active = `txt-1` on `bg-2` with a `txt-2` border):
- Sort: Recently added · Artist · Year · Most played
- Density: Comfortable (5 cols) · Dense (7 cols, labels hidden) · Large (4 cols)
- `Stress test · 800` — switches to an 800-album synthetic set at 54px tiles to prove the grid holds.

Tiles: `aspect-ratio: 1`, 2px radius, `e-1`, a 1px `oklch(1 0 0 / 0.08)` hairline (night) or `oklch(0 0 0 / 0.10)` (day) so pale sleeves don't bleed into the background. Labels beneath: Literata 14.5px title clamped to two lines, then artist (11px `txt-2`, ellipsised) and right-aligned mono year.

Gaps: 20px desktop, 12px mobile.

**Responsive:** *reflows.* Mobile is 2 columns; density control is hidden (comfortable only).

### 3. Album detail
*Screenshots: `03-desktop-album-detail-front.png`, `04-…-tracklist.png`, `05-…-back-of-sleeve.png`, `29-mobile-album-detail.png`, `36-day-album-detail.png`*

The most important screen after Now Playing. **Two faces.**

**Head region** — `display: flex; gap: 34px; flex-wrap: wrap`:
- **Sleeve, 340px** (100% on mobile), with a glow behind it: `inset: -14%`, `border-radius: 50%`, `filter: blur(56px)`, `opacity: 0.62` night / 0.5 day, radial from `art-glow`. Sleeve itself: 2px radius, `e-2`, 1px hairline. Beneath, a mono hint: `F · turn the sleeve over`.
- **Info column**, `min-width: 260px`, bottom-aligned: mono eyebrow (`Jazz · album`, `Single work · three movements`, or `Compilation · 40 tracks`), the title at the stepped-down size, artist in Literata 20px `txt-2` (links to artist), then a mono metadata row: year · genre · `5 tracks` · `56 min` · `FLAC · 16 bit · 44.1 kHz`.
- **The provenance line** (mono, `txt-3`, max 60ch) — a one-line factual biography of *this copy*: `Acquired 14 Mar 2024 · 214 plays · last on 19 Aug 2026 · never resampled`. For hi-res: `· resampled to 48 kHz on 4 of those`. No streaming service can render this sentence; it is the strongest argument that this library is the user's.
- Actions, 44px minimum: **Play** (solid `txt-1` on `bg-0`, 600 weight, with a triangle glyph), `Add to queue`, `In favourites` / `Add to favourites`.

**Front face — tracklist.** Header row in mono eyebrow style with a 1px bottom rule: `#` (30px) · Title · [Artist, 170px, VA only] · Format (120px, right) · Plays (56px, right) · Time (54px, right). Rows: `10px 8px`, 1px `line-soft` separator, 3px radius. The currently-playing row gets a `bg-2`-ish tint. Titles wrap to two lines rather than truncating — classical movement titles need it.

**Back face — the risk, and the one memorable interaction.** Press `F` or click the sleeve and the lower half *turns over*. Not a tab: a turn. The sleeve rotates `rotateY(-4deg)` over 260ms and the content below cross-rises. The back carries:
- A liner note in Literata 17px / 1.65 at max 74ch.
- Credits in an `auto-fit minmax(200px, 1fr)` grid — mono uppercase role, 13.5px name (Producer, Engineer, Studio, Mastering).
- A technical block, mono 10.5px, 150px label column: Release / Source (`CD rip · EAC secure mode`) / Encoding / ReplayGain (`album −8.42 dB · track −8.9 dB`) / MusicBrainz release id.
- Release context from MusicBrainz, in a bordered box — **dashed** border when absent.

**Three album shapes must be handled** (all in the mock data):
- Normal 10-track album.
- **40-track Various Artists compilation** (`23-album-various-artists-40-track.png`) — the per-track artist column appears only here, 170px, ellipsised.
- **Single-work classical, three long movements** (`22-album-classical-three-movements.png`) — 18/22/26 minutes, full movement titles wrapping to two lines.
- **No artwork** (`24-album-no-artwork.png`) — a diagonally striped placeholder with mono `NO ARTWORK` / `cover.jpg not found`. Designed, not broken.

**Responsive:** *reorganises.* Mobile stacks sleeve over info, full-bleed sleeve, and the format column drops out of the tracklist (format moves to the album-level metadata row).

### 4. Artists index & detail
*Screenshot: `06-desktop-artists-index.png`*

Index: two-column `auto-fill minmax(260px, 1fr)` list, rows of 36px thumb + name + right-aligned mono `14 · 892 plays`. Hover tints the name to `signal`.

Detail: mono `Artist` eyebrow, name at Literata 46px, mono meta line `14 albums · 892 plays · first heard March 2019`, biography in Literata 17px at max 66ch — **or**, when MusicBrainz has nothing, a dashed-bordered mono block: `No biography. MusicBrainz has an artist entry but no text, and ListenBrainz has nothing to add.` Then the discography **in release order**: mono year (38px) + 36px thumb + title + right-aligned play count.

Cover both extremes: an artist with 14 albums (Brian Eno) and one with a single release (Nick Drake).

### 5. Genres
*Screenshot: `07-desktop-genres.png`*

`auto-fill minmax(190px, 1fr)`, 10px gaps. Each tile: `min-height: 110px`, 18px padding, 1px border, 6px radius, background `linear-gradient(160deg, art-wash 0%, transparent 90%)` derived from the genre's first album. Genre name in Literata 22px, mono meta `9 albums · 39 tracks` beneath. Sub-line under the page title: `enriched from musicbrainz · file tags ignored`.

Genre hues (fixed, warm-family, semantic — not the artwork accent): Jazz 62, Rock 28, Electronic 96, Ambient 128, Classical 44, Hindustani 12, World 78.

### 6. Playlists & 7. Favourites
*Screenshots: `08-desktop-playlists.png`, `09-desktop-favourites.png`*

Playlists: max 760px list, rows of 36px thumb + name (Literata 17px) + mono `42 tracks · 3 h 16 min`, with an optional right-aligned pill — solid border for `Smart · rule-based`, **dashed** for `Planned`.

Favourites: the standard sleeve grid, sub-line `12 albums · loved, not liked · no algorithm reads this`.

### 8. Now Playing (full screen)
*Screenshots: `26-now-playing-desktop.png`, `30-mobile-now-playing.png`*

Covers the content region (`inset: 0`, `z-index: 40`), background `art-deep`, plus a wash layer `radial-gradient(110% 80% at 50% 0%, art-wash, transparent 70%)`. Rises 260ms from the bottom.

Header: `▾ CLOSE`, centred mono context `FROM KIND OF BLUE`, `LYRICS` toggle pill.

Body — desktop is a row with 64px gap and `20px 7vw 50px` padding; mobile stacks and centres:
- **Sleeve**, `min(42vh, 460px)` desktop / 78% mobile, with the `blur(64px)` glow behind it, `e-3` shadow, background transitioning over 620ms on track change.
- **Info column**, max 520px: mono `NOW PLAYING` eyebrow; title in Literata 300 at 46px (34px if >44 chars; 28/24 mobile); artist at 20px `txt-2`; mono `Album · Year`.
- **Scrubber**: elapsed (mono 11px tabular) — 4px groove — duration. Click to seek. `role="slider"`, labelled, keyboard-operable.
- **Transport**: prev / 56px circular play-pause / next, 26px gaps, all ≥44px hit area.
- **Signal block**, 1px top rule, mono: the chain, the output line, then `NEXT` with the next track right-aligned and ellipsised.

**Responsive:** *reflows* — the same composition, stacked and centred on mobile.

### 9. Lyrics — three variants
*Screenshots: `25-lyrics-synced.png`, `27-lyrics-absent.png`*

Typography carries this screen entirely. Treat it as a typographic composition — **this is the most beautiful screen in the app or it's wrong.**

**Synced.** A single centred column, `max-width: 760px` (340px mobile) — a real reading measure, not a narrow ribbon. Each line is a button, `padding: 9px 0`:
- **Active:** Literata **500**, 34px, colour `art-lyric`, `opacity: 1`.
- **±1 line:** weight 300, 29px, `txt-1`, `opacity: 0.5`.
- **±2:** `opacity: 0.28`. **Beyond:** `opacity: 0.14`.
- Lines *fall away by weight and opacity* — they never disappear.
- Transition 620ms on opacity and colour, 260ms on size.
- **Tapping any line seeks to its timestamp.**

**Unsynced (plain text).** Same column at 620px, mono eyebrow `Unsynced · plain text from lrclib`, lines in Literata 22px / 1.75 in `txt-2`. No emphasis, no scroll-sync.

**Absent.** Max 520px. Literata 300 at 30px: `No lyrics for this track.` Then mono, 1.9 line-height: `lrclib returned no match for` / `<Title> · <Artist>` / blank / `Instrumental, or nobody has transcribed it. Either is fine.` **Designed, not empty** — no spinner that never resolves.

### 10. Crate-digging mode
*Screenshots: `10-desktop-crate-card.png`, `32-mobile-crate.png`*

An explicit anti-algorithm. One album at a time, full screen, drawn from records owned but long unplayed.

Centred column, max 560px, rising in over 620ms. Mono session counter at top: `Crate · 4 dug · 1 played`.

**The card**: max 420px square, `e-3`, with two offset stack layers behind it (`translate(10px, 10px) scale(0.985)` at `brightness(0.5)`, and `translate(20px, 20px) scale(0.97)` on `bg-2`) so it reads as a stack of records in a crate.

Beneath: title in Literata 300 at 30px, artist at 14px, then **the reason** in mono 11.5px at max 44ch — the whole point of the feature:
- `You haven't played this since 14 Sep 2024. 9 plays, all of them before then.`
- `Never played. It has been on the shelf since the day it was ripped.`

Then mono tech line, then three ≥44px actions: **Pull it out** (solid), **Keep digging**, **Bury for a year**.

**Session summary / empty state**: `Pulled out.` or `You have dug through the whole crate.`, a mono two-line explanation, and three mono 30px tabular figures — dug / played / buried — above a `Start a new dig` button.

Deliberately **button-driven rather than swipe-driven**: gesture-first crate mode fights the "deliberate, not infinite" principle. Keyboard-first on desktop.

### 11. Statistics dashboard
*Screenshots: `11-desktop-stats-dashboard.png`, `12-desktop-stats-scrolled.png`, `33-mobile-stats.png`, `37-day-stats.png`*

An instrument panel to check, not read. Information design: same tiles always in the same place, semantic colour kept separate from the accent, charts given the same care as the type.

Range chips top-right: This week · This month · This year · All time.

**KPI strip** — a 5-column grid (2 on mobile) of 1px-separated cells on `bg-1`, 16px padding, 6px radius, `overflow: hidden`. Each: mono uppercase label, a **22px mono tabular** value, a mono 10px sub-line. Labels are deliberately short (`Time`, `Plays`, `Albums`, `Streak`, `New`) so nothing wraps at any width; the detail lives in the sub-line.

**Listening clock** — a 7×24 hour-by-weekday heatmap. 24-column grid, 2px gaps, 14px cells, 1px radius, mono day labels down the left and `00 / 06 / 12 / 18 / 23` beneath. Cell colour ramps `oklch(0.30 + v×0.48, 0.02 + v×0.075, 66 − v×16)` at night (inverted lightness by day); below 12% intensity the cell is plain `bg-2`. Every cell carries a title: `Tue 22:00 · 11 plays`.

**Format breakdown** — the stat only this app can produce. Labelled bars: `FLAC · 16 bit · 44.1 kHz` / `24 bit · 96 kHz` / `24 bit · 192 kHz`, each with a percentage and a 6px `signal` bar.

**Top artists** — name, a 38%-width 5px bar, right-aligned tabular play count.

**Genre distribution** — a single 10px stacked bar using the fixed genre hues, with a wrapping legend of 8px swatches beneath.

Footer card: a bordered panel promoting the listening year — `Eleven chapters. Written from your own history. Not for posting anywhere.` + a `Read it` button.

**Responsive:** *reorganises.* Mobile drops to 2 KPI columns and single-column charts; the listening clock scrolls horizontally rather than shrinking below 8px cells.

### 12. The listening year
*Screenshot: `13-desktop-listening-year.png`*

**A completely different animal from the dashboard.** Editorial, scrollable, once a year. The honest version of what streaming services make as a marketing exercise: complete data, private, not optimised to be posted anywhere. It should feel like receiving a beautifully printed annual report about yourself.

`scroll-snap-type: y mandatory`, one full-height `<section>` per chapter, each `scroll-snap-align: start`, padding `70px 8vw` (40px 22px mobile), each on its own radial ground derived from a different album's palette, alternating left/right origin.

Per frame, max 660px: a header rule flanked by mono `Chapter one` and `January — March`; a Literata 300 title at 44px; a body paragraph in Literata 19px / 1.7 in `txt-2`; then two mono 32px tabular figures with mono uppercase captions above a 1px rule.

Five chapters are written in the prototype — real prose, real numbers, e.g. *"A month of one record, played at exactly the same hour."* with `41 consecutive nights` / `22:24 median start`. Copy this tone: specific, factual, slightly wry, never congratulatory.

### 13. Search
*Screenshot: `34-mobile-search.png`*

A borderless Literata 26px input under a mono `/`, with a 1px bottom rule and an `Ask mode` chip. Placeholder: `Search 56 albums, 641 tracks…`

- **Empty:** mono eyebrow `Recent searches` + pill buttons (`talk talk`, `24 bit`, `yaman`, `basinski`, `unplayed jazz`).
- **Results:** grouped by type with counted mono headers (`Albums · 4`, `Tracks · 6`), rows of 36px thumb + title + sub + right-aligned meta.
- **No results:** Literata 24px `Nothing in the library matches that.` + mono `56 albums searched · titles, artists, tracks, credits` / **`This library is finite. That's the point.`**

### 14. Ambient display
*Screenshots: `20-ambient-display.png`, `21-ambient-display-oled-safe.png`*

A kiosk/screensaver surface for a second monitor, a propped tablet, a panel by the amplifier. **Ten-foot legibility.** This should be the thing a visitor notices from across the room.

Fixed, `inset: 0`, `z-index: 70`. A blurred wash (`inset: -10%`, `blur(80px)`) drifting on a 90-second `nyxdrift` cycle. Sleeve at `min(56vh, 620px)` with its own glow and `0 40px 100px` shadow. Text column, max 640px: mono clock at 13px / 0.22em, title at `clamp(44px, 5.4vw, 84px)`, artist at 34px, a 24-bar level meter (4px gaps, 52px tall, bars in `art-bar`), then mono 15px signal chain and `NEXT · <track>`.

**OLED-safe variant** (toggle, bottom centre): the entire stage joins the drift on a 62s cycle, the wash speeds to 48s and drops to `opacity: 0.45`, and the meters dim to `opacity: 0.5`. Nothing bright stays static.

> **Not final:** the meters are currently seeded pseudo-random. Either drive them from real audio analysis (Web Audio `AnalyserNode`) or drop them — a fake visualiser fails the "designed element, not a stock visualiser" test.

### 15. Settings
*Screenshot: `14-desktop-settings.png`*

Max 760px, seven sections, each with a mono uppercase header over a 1px rule. Rows: label at 13.5px + mono hint beneath, right-aligned value pill (solid border normally, **dashed** for planned features).

Sections and notable rows:
- **Library and scanning** — Server (`navidrome · http://nyx.local:4533`), Scan, Watch folders.
- **Playback** — Gapless (`preloads the next track 8 s early`), ReplayGain (`album gain preserves the record as sequenced`), Crossfade (`off is correct for albums`), Quality away from home, Quality at home (`wired to the Pi · never transcode` → `bit-perfect`).
- **Appearance** — Theme, **Artwork drives the palette** (`clamped to WCAG AA regardless of position`, 0–100%, default 70), Density.
- **Lyrics and enrichment** — source, genre provider, `When offline → degrade quietly` (`absent states, never spinners`).
- **Statistics and privacy** — `Play history → local only` (`stored on the Pi, never leaves it`), ListenBrainz submission, Listening year.
- **Devices and handoff** — This device, plus three `planned` rows.
- **About** — version, library size, backend.

### 16. System states
*Screenshots: `15-state-scanning.png`, `16-state-first-run-summary.png`*

One component, five states, each: a mono uppercase kicker in the state's semantic colour, a Literata 26px title, a mono body with real numbers, an optional progress bar, and one action.

| State | Colour | Title | Body |
|---|---|---|---|
| Server unreachable | `negative` | The Pi is not answering. | `nyx.local:4533 · last seen 14 minutes ago` / `Your queue is intact and will resume when it returns.` / `Nothing has been lost.` |
| Scanning | `warning` | Reading the shelves. | `412 of 641 tracks · 3 new albums found` / `You can browse what is already indexed.` — 64% bar |
| Empty library | `txt-3` | Nothing on the shelves yet. | `Point Nyx at a folder of FLACs and it will do the rest.` / `The first scan of 500 albums takes about four minutes.` |
| Offline | `warning` | Enrichment is unavailable. | `Lyrics, genres and biographies come from the internet.` / `Playback is unaffected — the music is on your own hardware.` |
| First run (step 3 of 3) | `positive` | Found 56 albums. Four of them need you. | `52 albums matched cleanly` / `1 album has no artwork` / `2 albums look like upscaled MP3s sold as FLAC` / `1 release could not be matched in MusicBrainz` |

The tone throughout: honest, specific, calm. Never apologetic, never alarmed.

---

## "Coming soon" treatment — one component, applied uniformly

**Never ad-hoc greying-out.** A single defined state:

- Container: **1px dashed** `line` border, 10px radius, `opacity: 0.72`.
- A `Planned` pill: mono 9px, 0.16em, uppercase, 999px radius, dashed border, `txt-3`.
- Next to it, a mono version note: `natural-language search · v1.2`.
- Content is rendered **fully designed**, not blanked — the user sees what they'll get.

Applied to: natural-language "ask" search (the input, the thinking state with a pulsing dot and `reading 56 sleeves, 641 tracks, 14 months of history…`, and results that explain *why* they matched — `quiet · 9 plays after 22:00 · nothing above mezzo-forte`); tiered external results (`In your library` / `Free and legal` / `Available to buy` / `Findable elsewhere`); handoff; NFC tap-to-play; party queue; smart playlists.

Still to design when those features come up: library health inbox, offline downloads, the wishlist acquisition state machine (wanted → searching → downloading → tagging → in library), and the **"playing a lossy copy while the lossless one arrives"** provisional-track state.

---

## State model

```
screen        'home'|'albums'|'album'|'artists'|'artist'|'genres'|
              'playlists'|'fav'|'search'|'crate'|'stats'|'year'|'settings'
albumId       string        artistName   string
queue         Track[]       qi           number   // index of current
playing       boolean       t            number   // elapsed seconds
theme         'dark'|'light'          vp    'desktop'|'mobile'
np            boolean  // Now Playing sheet
lyr           boolean  // lyrics vs artwork inside the sheet
qOpen         boolean  // queue panel
cmd, cmdQ     boolean, string
keys          boolean  // shortcut overlay
ambient, burn boolean  // ambient display, OLED-safe
sortBy        'added'|'artist'|'year'|'plays'
dense         'comfortable'|'dense'|'large'      big  boolean (800 stress test)
back          boolean  // album detail: front vs back of sleeve
range         'week'|'month'|'year'|'all'
crateI, dug, played, crateEnd
q, ask        string, boolean
sys           system-state key
```

**Playback clock.** A 250ms interval advancing `t` by the **wall-clock delta** (not a fixed increment), so background throttling can't desync the timeline. At `t >= duration`, advance to the next queue item or stop. In production this is the real audio element's `timeupdate`; the delta approach is what the prototype simulates.

**Palette derivation** is a pure function of the current track's album — recompute on every track change, animate the result.

---

## Data model (OpenSubsonic-shaped)

```
Album  { id, title, artist, year, genre, plays, format, trackCount,
         lastPlayed, coverArt, acquired }
Track  { no, title, artist, duration, format, plays, albumId }
```

Mock data: 56 albums across jazz, Hindustani classical, Western classical, electronic, rock, ambient and world; decades from 1957 to 2023; play counts 0–400; mostly 16/44.1 with several 24/96 and one 24/192.

**The hard cases are deliberately in the data and must not be removed** — they are where designs break: the 86-character Basinski title; the three-movement Górecki; the 40-track Various Artists compilation; an album with no artwork; a track with no lyrics; an artist with 14 albums and one with a single release; diacritics throughout.

---

## Assets

**No CDN and no external runtime assets.** The Pi may have no internet connection. Everything must be self-contained, with one exception: a Google Fonts link for Literata / Alegreya Sans / IBM Plex Mono — **and even that should be self-hosted for production**, with the fallback stacks kept behind it.

**Cover art is procedurally generated in the prototype** — CSS gradients in seven varieties (banded, split, concentric, grain, typographic, near-monochrome, and one deliberately garish conic) so the palette-extraction system can be tested against genuine variety in hue, contrast and busyness. **These are placeholders.** In production, real cover art comes from Navidrome's `getCoverArt` endpoint. Keep the striped `NO ARTWORK` placeholder as the genuine missing-art state.

No icon assets are bundled; choose one icon family in the target codebase.

---

## Files in this bundle

```
README.md                          this document
prototype/Nyx Audio.dc.html        the working prototype (design reference)
prototype/support.js               authoring runtime — ignore, not architecture
tokens/nyx-tokens.css              canonical tokens + Flutter mapping notes
screenshots/                       38 captures, desktop / mobile / day / night
```

`tokens/nyx-tokens.css` carries a `FLUTTER TRANSLATION NOTES` block at the end listing what *not* to build on: no `backdrop-filter`, `vw`/`vh` only in the ambient display (use `LayoutBuilder` ratios), gradients map 1:1 to `LinearGradient`/`RadialGradient`/`SweepGradient`, `text-wrap: pretty` replaced by the size step-down rule, and marquee banned.

## Open questions for the designer

1. Ambient level meters — real audio analysis, or cut them?
2. The 800-album stress test currently reuses 56 sleeves with rotated hues; if the real library grows past ~200, the grid may want virtualisation.
3. The wishlist acquisition state machine and the provisional lossy-copy track state are specified in the brief but not yet designed.
