import { describe, expect, it } from 'vitest'
import {
  contrastRatio, oklchToRgb, rgbToOklch,
} from '../src/palette/color.js'
import {
  ACHROMATIC_C, FALLBACK_HUE, RUNGS, WASH_OPACITY, buildPalette,
  compositedWashL, dominantHue, kmeans, safeTextOnWash,
} from '../src/palette/palette.js'
import type { Oklch } from '../src/palette/color.js'

const parse = (s: string): Oklch => {
  const m = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(s)!
  return { L: +m[1]!, C: +m[2]!, h: +m[3]! }
}

// The night text tokens. These never move — that is half the guarantee.
const TXT = {
  'txt-1': { L: 0.965, C: 0.022, h: 80 },
  'txt-2': { L: 0.800, C: 0.030, h: 70 },
  'txt-3': { L: 0.650, C: 0.034, h: 62 },
}

describe('colour conversion', () => {
  it('round-trips sRGB through OKLCH', () => {
    for (const rgb of [
      { r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 },
      { r: 217, g: 131, b: 36 }, { r: 12, g: 90, b: 140 },
    ]) {
      const back = oklchToRgb(rgbToOklch(rgb))
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1)
    }
  })

  it('agrees with known OKLCH lightness values', () => {
    expect(rgbToOklch({ r: 255, g: 255, b: 255 }).L).toBeCloseTo(1.0, 2)
    expect(rgbToOklch({ r: 0, g: 0, b: 0 }).L).toBeCloseTo(0.0, 2)
  })
})

describe('the contrast guarantee', () => {
  // This is the design's central claim, and the reason lightness is pinned.
  // If it fails for even one hue, the whole approach is unsound — so check
  // every hue, at maximum chroma and maximum user strength.
  // The wash is a gradient composited over bg-0, never a solid — so test it
  // the way it is actually painted. Testing the solid would condemn a design
  // that is in fact fine on most screens.
  it('holds for EVERY hue on normally-washed screens', () => {
    const failures: string[] = []
    const L = compositedWashL(WASH_OPACITY.normal)

    for (let hue = 0; hue < 360; hue++) {
      const surface = oklchToRgb({ L, C: RUNGS.dark.wash.C * WASH_OPACITY.normal, h: hue })
      for (const [name, tok] of Object.entries(TXT)) {
        const r = contrastRatio(oklchToRgb(tok), surface)
        if (r < 4.5) failures.push(`${name} at hue ${hue}: ${r.toFixed(2)}`)
      }
    }
    expect(failures).toEqual([])
  })

  // Album detail and crate flood the wash to 0.95, where txt-3 does NOT clear
  // AA. safeTextOnWash exists so no screen has to remember that.
  it('demotes txt-3 to txt-2 on flooded screens, and txt-2 is genuinely safe', () => {
    expect(safeTextOnWash(WASH_OPACITY.flooded)).toBe('txt-2')
    expect(safeTextOnWash(WASH_OPACITY.normal)).toBe('txt-3')

    const L = compositedWashL(WASH_OPACITY.flooded)
    let worst = Infinity
    for (let hue = 0; hue < 360; hue++) {
      const surface = oklchToRgb({ L, C: RUNGS.dark.wash.C * WASH_OPACITY.flooded, h: hue })
      worst = Math.min(worst, contrastRatio(oklchToRgb(TXT['txt-2']), surface))
    }
    expect(worst).toBeGreaterThanOrEqual(4.5)
  })

  it('confirms txt-3 on a flooded wash really would fail — the reason the helper exists', () => {
    const L = compositedWashL(WASH_OPACITY.flooded)
    const surface = oklchToRgb({ L, C: RUNGS.dark.wash.C * WASH_OPACITY.flooded, h: 300 })
    expect(contrastRatio(oklchToRgb(TXT['txt-3']), surface)).toBeLessThan(4.5)
  })

  it('deep is safe for every token at every hue — it is a solid', () => {
    const failures: string[] = []
    for (let hue = 0; hue < 360; hue++) {
      const surface = oklchToRgb(parse(buildPalette(hue, 0.4, 'dark', 1.0).deep))
      for (const [name, tok] of Object.entries(TXT)) {
        const r = contrastRatio(oklchToRgb(tok), surface)
        if (r < 4.5) failures.push(`${name} at hue ${hue}: ${r.toFixed(2)}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('pins lightness regardless of what the artwork says', () => {
    // Artwork claiming near-black and near-white must produce identical L.
    for (const chroma of [0, 0.05, 0.2, 0.4]) {
      for (const hue of [0, 90, 180, 270]) {
        const p = buildPalette(hue, chroma, 'dark', 1.0)
        expect(parse(p.wash).L).toBeCloseTo(RUNGS.dark.wash.L, 5)
        expect(parse(p.deep).L).toBeCloseTo(RUNGS.dark.deep.L, 5)
        expect(parse(p.bar).L).toBeCloseTo(RUNGS.dark.bar.L, 5)
      }
    }
  })

  it('caps chroma at the rung ceiling however vivid the sleeve', () => {
    const p = buildPalette(30, 0.9, 'dark', 1.0)
    expect(parse(p.wash).C).toBeLessThanOrEqual(RUNGS.dark.wash.C + 1e-9)
    expect(parse(p.bar).C).toBeLessThanOrEqual(RUNGS.dark.bar.C + 1e-9)
  })

  it('scales chroma by the user strength setting, never lightness', () => {
    const weak = buildPalette(30, 0.4, 'dark', 0.1)
    const full = buildPalette(30, 0.4, 'dark', 1.0)
    expect(parse(weak.wash).C).toBeLessThan(parse(full.wash).C)
    expect(parse(weak.wash).L).toBe(parse(full.wash).L)
  })

  it('holds in the light theme too', () => {
    const failures: string[] = []
    const dayTxt = { L: 0.245, C: 0.026, h: 48 } // --nyx-txt-1, day
    for (let hue = 0; hue < 360; hue += 3) {
      const p = buildPalette(hue, 0.4, 'light', 1.0)
      for (const s of ['wash', 'deep'] as const) {
        const r = contrastRatio(oklchToRgb(dayTxt), oklchToRgb(parse(p[s])))
        if (r < 4.5) failures.push(`day txt-1 on ${s} at hue ${hue}: ${r.toFixed(2)}`)
      }
    }
    expect(failures).toEqual([])
  })
})

describe('achromatic artwork', () => {
  it('falls back to the warm neutral rather than amplifying noise', () => {
    // A black-and-white sleeve has a hue, but it is meaningless.
    const p = buildPalette(210, 0.002, 'dark', 1.0)
    expect(parse(p.wash).h).toBe(FALLBACK_HUE)
    expect(parse(p.wash).C).toBeLessThan(ACHROMATIC_C)
  })

  it('reports the fallback when no swatch carries colour', () => {
    const grey = [0.1, 0.3, 0.5, 0.7].map((L) => ({
      oklch: { L, C: 0.001, h: 123 }, weight: 0.25,
    }))
    expect(dominantHue(grey)).toEqual({ hue: FALLBACK_HUE, chroma: 0 })
  })
})

describe('dominantHue', () => {
  it('prefers a vivid minority over a drab majority', () => {
    // 80% black card, 20% red lettering — the sleeve reads as red.
    const { hue } = dominantHue([
      { oklch: { L: 0.15, C: 0.004, h: 250 }, weight: 0.8 },
      { oklch: { L: 0.55, C: 0.180, h: 25 }, weight: 0.2 },
    ])
    expect(hue).toBeCloseTo(25, 5)
  })
})

describe('kmeans', () => {
  it('is deterministic — the same cover must not flicker between renders', () => {
    const pixels = Array.from({ length: 200 }, (_, i) => ({
      r: (i * 7) % 256, g: (i * 13) % 256, b: (i * 29) % 256,
    }))
    const a = kmeans(pixels, 5)
    const b = kmeans(pixels, 5)
    expect(a.map((s) => s.oklch)).toEqual(b.map((s) => s.oklch))
  })

  it('separates two obvious clusters', () => {
    const pixels = [
      ...Array.from({ length: 50 }, () => ({ r: 200, g: 30, b: 30 })),
      ...Array.from({ length: 50 }, () => ({ r: 30, g: 30, b: 200 })),
    ]
    const hues = kmeans(pixels, 2).map((s) => Math.round(s.oklch.h))
    expect(hues.length).toBe(2)
    expect(Math.abs(hues[0]! - hues[1]!)).toBeGreaterThan(60)
  })

  it('returns nothing for no pixels rather than throwing', () => {
    expect(kmeans([], 5)).toEqual([])
  })
})
