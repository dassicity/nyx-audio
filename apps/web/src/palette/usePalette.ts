/**
 * Applies the artwork palette to CSS custom properties.
 *
 * The transition is one of only four motion moments in the product, so it is
 * done here in one place rather than scattered through components.
 */
import { useEffect } from 'react'
import { buildPalette, dominantHue, FALLBACK_HUE } from './palette.js'
import { extractSwatches } from './extract.js'

export type Theme = 'dark' | 'light'

export function applyPalette(hue: number, chroma: number, theme: Theme, strength: number): void {
  const p = buildPalette(hue, chroma, theme, strength)
  const root = document.documentElement
  root.style.setProperty('--nyx-art-wash', p.wash)
  root.style.setProperty('--nyx-art-deep', p.deep)
  root.style.setProperty('--nyx-art-glow', p.glow)
  root.style.setProperty('--nyx-art-bar', p.bar)
  root.style.setProperty('--nyx-art-lyric', p.lyric)
  root.style.setProperty('--nyx-art-hue', String(hue))
}

/** Derive and apply the palette for a cover. Falls back silently — a missing
 *  cover should leave the interface looking like itself, not broken. */
export function usePalette(
  coverUrl: string | undefined,
  theme: Theme = 'dark',
  strength = 0.7,
): void {
  useEffect(() => {
    let cancelled = false

    if (!coverUrl) {
      applyPalette(FALLBACK_HUE, 0, theme, strength)
      return
    }

    void extractSwatches(coverUrl)
      .then((swatches) => {
        if (cancelled) return
        const { hue, chroma } = dominantHue(swatches)
        applyPalette(hue, chroma, theme, strength)
      })
      .catch(() => {
        if (!cancelled) applyPalette(FALLBACK_HUE, 0, theme, strength)
      })

    return () => { cancelled = true }
  }, [coverUrl, theme, strength])
}
