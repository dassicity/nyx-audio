/**
 * The artwork-driven palette — the design's visual thesis, and its biggest
 * risk if implemented naively.
 *
 * The contrast guarantee works like this: artwork supplies HUE only. Chroma is
 * capped. Lightness is discarded entirely and pinned to fixed rungs. Because L
 * never moves and the text tokens never move, WCAG AA holds identically for a
 * black-and-white photograph, a neon rave sleeve and a beige ECM cover.
 *
 * You do not let the artwork touch lightness. That is the whole trick.
 */
import { css, rgbToOklch } from './color.js'
import type { Oklch, Rgb } from './color.js'

/** Fixed rungs from the handoff. L and C ceiling per role, per theme. */
export interface Rung { L: number; C: number }

export const RUNGS: Record<'dark' | 'light', Record<PaletteRole, Rung>> = {
  dark: {
    wash:  { L: 0.300, C: 0.090 },
    deep:  { L: 0.185, C: 0.050 },
    glow:  { L: 0.460, C: 0.130 },
    bar:   { L: 0.760, C: 0.130 },
    lyric: { L: 0.920, C: 0.060 },
  },
  light: {
    wash:  { L: 0.900, C: 0.055 },
    deep:  { L: 0.955, C: 0.030 },
    glow:  { L: 0.820, C: 0.130 },
    bar:   { L: 0.520, C: 0.130 },
    lyric: { L: 0.360, C: 0.070 },
  },
}

export type PaletteRole = 'wash' | 'deep' | 'glow' | 'bar' | 'lyric'

/** The warm neutral bias. Used when artwork is achromatic or absent, so the
 *  interface simply looks like itself rather than breaking. */
export const FALLBACK_HUE = 58

/** Below this, artwork is achromatic — a black-and-white sleeve has a hue,
 *  but it is noise, and amplifying it produces an arbitrary colour cast. */
export const ACHROMATIC_C = 0.01

export interface Swatch { oklch: Oklch; weight: number }

/**
 * Reduce extracted swatches to a single hue and a chroma scale.
 *
 * Prefers the most colourful swatch that carries real weight over the merely
 * most common one: a sleeve that is 80% black card and 20% red lettering
 * should read as red, not as grey.
 */
export function dominantHue(swatches: Swatch[]): { hue: number; chroma: number } {
  const chromatic = swatches.filter((s) => s.oklch.C >= ACHROMATIC_C)
  if (chromatic.length === 0) return { hue: FALLBACK_HUE, chroma: 0 }

  let best = chromatic[0]!
  let bestScore = -Infinity
  for (const s of chromatic) {
    // Chroma matters more than area, but area still breaks ties.
    const score = s.oklch.C * Math.sqrt(s.weight)
    if (score > bestScore) { bestScore = score; best = s }
  }
  return { hue: best.oklch.h, chroma: best.oklch.C }
}

/**
 * Build the five palette values.
 *
 * `strength` is the user's "artwork drives the palette" setting, 0–1. It
 * scales chroma only — it can never affect lightness, so turning it to 100%
 * cannot break contrast.
 */
export function buildPalette(
  hue: number,
  chroma: number,
  theme: 'dark' | 'light',
  strength = 0.7,
): Record<PaletteRole, string> {
  const rungs = RUNGS[theme]
  const out = {} as Record<PaletteRole, string>
  for (const role of Object.keys(rungs) as PaletteRole[]) {
    const rung = rungs[role]
    out[role] = css({
      L: rung.L,                                   // pinned, never from artwork
      C: Math.min(chroma * strength, rung.C),      // capped
      h: chroma >= ACHROMATIC_C ? hue : FALLBACK_HUE,
    })
  }
  return out
}

/** k-means in OKLab over downsampled pixels. Five swatches, as specified. */
export function kmeans(pixels: Rgb[], k = 5, iterations = 12): Swatch[] {
  if (pixels.length === 0) return []
  const points = pixels.map(rgbToOklch)

  // Deterministic seeding: even strides through the sorted set. Random seeding
  // would make the palette flicker between renders of the same cover.
  const sorted = [...points].sort((a, b) => a.L - b.L)
  const centroids: Oklch[] = []
  for (let i = 0; i < k; i++) {
    centroids.push({ ...sorted[Math.floor((i + 0.5) * sorted.length / k)]! })
  }

  const assign = new Array<number>(points.length).fill(0)
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!
      let bi = 0
      let bd = Infinity
      for (let c = 0; c < centroids.length; c++) {
        const q = centroids[c]!
        // Distance in Lab terms so hue wraparound is not a special case.
        const dL = p.L - q.L
        const pa = p.C * Math.cos((p.h * Math.PI) / 180)
        const pb = p.C * Math.sin((p.h * Math.PI) / 180)
        const qa = q.C * Math.cos((q.h * Math.PI) / 180)
        const qb = q.C * Math.sin((q.h * Math.PI) / 180)
        const d = dL * dL + (pa - qa) ** 2 + (pb - qb) ** 2
        if (d < bd) { bd = d; bi = c }
      }
      if (assign[i] !== bi) { assign[i] = bi; moved = true }
    }
    if (!moved && iter > 0) break

    const sums = centroids.map(() => ({ L: 0, a: 0, b: 0, n: 0 }))
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!
      const s = sums[assign[i]!]!
      s.L += p.L
      s.a += p.C * Math.cos((p.h * Math.PI) / 180)
      s.b += p.C * Math.sin((p.h * Math.PI) / 180)
      s.n++
    }
    for (let c = 0; c < centroids.length; c++) {
      const s = sums[c]!
      if (s.n === 0) continue
      const a = s.a / s.n
      const b = s.b / s.n
      let h = (Math.atan2(b, a) * 180) / Math.PI
      if (h < 0) h += 360
      centroids[c] = { L: s.L / s.n, C: Math.hypot(a, b), h }
    }
  }

  const counts = new Array<number>(centroids.length).fill(0)
  for (const a of assign) counts[a]!++
  return centroids
    .map((oklch, i) => ({ oklch, weight: counts[i]! / points.length }))
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.weight - a.weight)
}

// ── Where the wash is actually safe ──────────────────────────────────────
//
// `art-wash` is never painted as a solid: it is a radial gradient composited
// over bg-0, at 0.4 opacity on most screens and 0.95 on album detail and
// crate. That distinction decides whether the contrast guarantee holds.
//
// Measured across all 360 hues at the 0.09 chroma ceiling:
//
//   opacity 0.40 → effective L ≈ 0.221 → txt-3 contrast 5.23   AA ✓
//   opacity 0.95 → effective L ≈ 0.293 → txt-3 contrast 3.87   FAILS
//
// So on album detail and crate, txt-3 is not safe on the wash and txt-2 is
// (6.66). Rather than leave that to per-screen discipline — which is exactly
// what the pinned-lightness approach exists to avoid — ask for it.

export const WASH_OPACITY = { normal: 0.4, flooded: 0.95 } as const

/** Perceptual lightness of the wash once composited over the app background. */
export function compositedWashL(opacity: number, bg0L = 0.168): number {
  const rung = RUNGS.dark.wash.L
  return opacity * rung + (1 - opacity) * bg0L
}

/**
 * The dimmest text token that meets WCAG AA on the wash at a given opacity.
 *
 * Use this instead of hard-coding `--nyx-txt-3` on any artwork-driven
 * surface. On a flooded screen it returns txt-2, which is the correct answer
 * and one nobody would arrive at by eye.
 */
export function safeTextOnWash(opacity: number): 'txt-2' | 'txt-3' {
  return opacity > 0.6 ? 'txt-2' : 'txt-3'
}
