/**
 * Client for nyx-api.
 *
 * Same origin as everything else, so paths are relative. Every call here is
 * best-effort: statistics failing must never stop music playing, and the
 * screens that use it are designed to render an absent state rather than an
 * error.
 */

export interface PlayEvent {
  track_id: string
  album_id?: string | undefined
  title: string
  artist: string
  album: string
  genre?: string | undefined
  duration: number
  format?: string | undefined
  bit_depth?: number | undefined
  sample_rate?: number | undefined
  output_sample_rate?: number | undefined
  path?: string | undefined
  played_at: string
  tz_offset_minutes: number
}

export interface Summary {
  plays: number
  seconds: number
  albums: number
  artists: number
  tracks: number
  streak_days: number
  new_albums: number
}

export interface ClockCell { weekday: number; hour: number; plays: number }
export interface FormatSlice { label: string; seconds: number; fraction: number }
export interface Ranked { name: string; plays: number; seconds: number }

export interface Stats {
  summary: Summary
  clock: ClockCell[]
  formats: FormatSlice[]
  top_artists: Ranked[]
  top_albums: Ranked[]
}

export type StatsRange = 'week' | 'month' | 'year' | 'all'

/** Thrown when nyx-api is not deployed yet, so screens can say so precisely
 *  rather than showing a generic failure. */
export class ApiUnavailable extends Error {
  constructor() {
    super('nyx-api is not reachable')
    this.name = 'ApiUnavailable'
  }
}

async function get<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(path)
  } catch {
    throw new ApiUnavailable()
  }
  if (res.status === 404 || res.status === 502 || res.status === 503) {
    throw new ApiUnavailable()
  }
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export async function getStats(range: StatsRange = 'all'): Promise<Stats> {
  return get<Stats>(`/api/stats?range=${range}`)
}

export async function getHealth(): Promise<{ ok: boolean; plays: number }> {
  return get('/api/health')
}

/**
 * Record a play.
 *
 * Deliberately fire-and-forget. Navidrome keeps its own counter; this keeps
 * the event, and the data you do not capture today cannot be reconstructed
 * later — but neither is worth interrupting playback for.
 */
export function recordPlay(event: PlayEvent): void {
  void fetch('/api/plays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  }).catch(() => {
    // nyx-api may not be deployed. Silent by design.
  })
}

export interface ApiLyrics {
  kind: 'synced' | 'plain' | 'instrumental' | 'absent'
  lines?: { time: number; text: string }[]
  text?: string
  cached?: boolean
}

export async function getLyrics(
  title: string, artist: string, album: string, duration: number,
): Promise<ApiLyrics> {
  const qs = new URLSearchParams({
    title, artist, album, duration: String(Math.round(duration)),
  })
  return get<ApiLyrics>(`/api/lyrics?${qs}`)
}
