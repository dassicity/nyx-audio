/**
 * Lyrics from LRCLIB — free, no API key, around three million tracks.
 *
 * Fetched straight from the browser for now. When nyx-api lands it should
 * proxy and cache these, so a Pi with no internet still serves what it has
 * already seen. Until then, absence is a designed state, not an error.
 */

export interface LyricLine {
  /** Seconds from the start of the track. */
  time: number
  text: string
}

export type Lyrics =
  | { kind: 'synced'; lines: LyricLine[] }
  | { kind: 'plain'; text: string }
  | { kind: 'instrumental' }
  | { kind: 'absent' }

/**
 * Parse LRC.
 *
 * Real files are messier than the format suggests: a single line can carry
 * several timestamps, blank lines are meaningful pauses, and metadata tags
 * like [ar:] look exactly like timestamps until you check.
 */
export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = []
  const stamp = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g

  for (const raw of lrc.split(/\r?\n/)) {
    stamp.lastIndex = 0
    const times: number[] = []
    let m: RegExpExecArray | null
    while ((m = stamp.exec(raw)) !== null) {
      const min = Number(m[1])
      const sec = Number(m[2])
      // Fractions may be 1–3 digits: .5 is 500ms, .05 is 50ms, .050 is 50ms.
      const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0
      times.push(min * 60 + sec + frac)
    }
    if (times.length === 0) continue

    const text = raw.replace(stamp, '').trim()
    // One line can be timestamped several times in a repeating chorus.
    for (const time of times) out.push({ time, text })
  }

  return out.sort((a, b) => a.time - b.time)
}

/** Index of the line active at `t`, or -1 before the first. */
export function activeLineAt(lines: LyricLine[], t: number): number {
  if (lines.length === 0) return -1
  // Binary search: this runs on every animation tick.
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid]!.time <= t) { ans = mid; lo = mid + 1 } else { hi = mid - 1 }
  }
  return ans
}

interface LrclibResponse {
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

export async function fetchLyrics(
  { title, artist, album, duration }:
  { title: string; artist: string; album: string; duration: number },
  signal?: AbortSignal,
): Promise<Lyrics> {
  const qs = new URLSearchParams({
    track_name: title,
    artist_name: artist,
    album_name: album,
    duration: String(Math.round(duration)),
  })

  const res = await fetch(`https://lrclib.net/api/get?${qs}`, signal ? { signal } : {})
  // 404 is the normal "nobody has transcribed this" answer, not a failure.
  if (res.status === 404) return { kind: 'absent' }
  if (!res.ok) throw new Error(`lrclib ${res.status}`)

  const data = await res.json() as LrclibResponse
  if (data.instrumental) return { kind: 'instrumental' }

  if (data.syncedLyrics) {
    const lines = parseLrc(data.syncedLyrics)
    if (lines.length > 0) return { kind: 'synced', lines }
  }
  if (data.plainLyrics?.trim()) return { kind: 'plain', text: data.plainLyrics }
  return { kind: 'absent' }
}
