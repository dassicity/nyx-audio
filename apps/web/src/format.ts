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

/** Album titles must step down by length rather than truncate or marquee —
 *  the handoff's rule, ported verbatim so Flutter can do the same. */
export function titleSize(title: string, mobile = false): number {
  if (title.length > 60) return mobile ? 26 : 34
  if (title.length > 30) return mobile ? 30 : 46
  return mobile ? 34 : 58
}
