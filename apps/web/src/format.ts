/** Duration as m:ss, or h:mm:ss past an hour — this library has 26-minute
 *  movements, so the hour case is not hypothetical. */
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '–:––'
  const s = Math.floor(seconds % 60)
  const m = Math.floor(seconds / 60) % 60
  const h = Math.floor(seconds / 3600)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** The signal path: real numbers, never an "HD" badge. */
export function signalPath(
  suffix?: string, bitDepth?: number, sampleRate?: number, bitRate?: number,
): string {
  const parts: string[] = []
  if (suffix) parts.push(suffix.toUpperCase())
  if (bitDepth) parts.push(`${bitDepth} bit`)
  if (sampleRate) parts.push(`${(sampleRate / 1000).toFixed(1)} kHz`)
  else if (bitRate) parts.push(`${bitRate} kbps`)
  return parts.join(' · ')
}

/** Say plainly when the browser is resampling, rather than implying it isn't. */
export function outputPath(sourceRate: number | undefined, contextRate: number): string {
  if (!sourceRate || !contextRate) return ''
  return sourceRate === contextRate
    ? `bit-perfect → ${(contextRate / 1000).toFixed(1)} kHz out`
    : `→ resampled to ${(contextRate / 1000).toFixed(1)} kHz by the browser mixer`
}

/**
 * A font size that honours the user's text-size setting.
 *
 * Sizes live as numbers in the components (matching the design handoff's
 * figures) and become scalable CSS here, so one setting moves everything and
 * the ratios of the scale are preserved.
 */
export function px(size: number): string {
  return `calc(${size}px * var(--nyx-text-scale))`
}

/** Album titles must step down by length rather than truncate or marquee —
 *  the handoff's rule, ported verbatim so Flutter can do the same. */
export function titleSize(title: string, mobile = false): string {
  if (title.length > 60) return px(mobile ? 26 : 34)
  if (title.length > 30) return px(mobile ? 30 : 46)
  return px(mobile ? 34 : 58)
}
