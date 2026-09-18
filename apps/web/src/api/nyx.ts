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

// ── import ───────────────────────────────────────────────────────────────

export type BatchStatus =
  | 'staging' | 'queued' | 'running' | 'imported' | 'partial' | 'failed'

export interface ImportFile {
  name: string
  bytes: number
  status: 'uploaded' | 'imported' | 'quarantined'
}

export interface Candidate {
  id: string
  name: string
  distance: number
  similarity: number
}

export interface Resolution {
  action: 'accept' | 'asis' | 'discard'
  outcome: ResolveOutcome
  message: string | null
  release_id: string | null
  at: string
}

/** beets' reasoning for one album, summarised from its verbose output. */
export interface AlbumDecision {
  album: string
  /** Where the files are, relative to the batch. Null for albums that filed. */
  folder: string | null
  best_match: string | null
  distance: number | null
  similarity: number | null
  decision: 'imported' | 'held' | 'unknown'
  candidates: Candidate[]
  resolution: Resolution | null
}

export type ResolveOutcome = 'filed' | 'duplicate' | 'held' | 'discarded' | 'failed'

export interface ResolveRequest {
  folder: string
  action: 'accept' | 'asis' | 'discard'
  release?: string
  keep_duplicate?: boolean
}

/** A person's decision about one held album. Waits for beets to finish:
 *  a deliberate click on one album, and the answer is worth waiting for. */
export async function resolveAlbum(
  batchId: string, body: ResolveRequest,
): Promise<{ outcome: ResolveOutcome; message: string; log: string }> {
  const res = await fetch(`/api/import/batches/${batchId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = `could not resolve (${res.status})`
    try { detail = (await res.json()).detail ?? detail } catch { /* keep */ }
    throw new Error(detail)
  }
  return res.json()
}

export interface ImportBatch {
  id: string
  created_at: string
  finished_at: string | null
  status: BatchStatus
  message: string | null
  log: string | null
  files?: ImportFile[]
  albums?: AlbumDecision[]
  file_count?: number
  bytes?: number
}

export async function createBatch(): Promise<{ id: string }> {
  const res = await fetch('/api/import/batches', { method: 'POST' })
  if (!res.ok) throw new ApiUnavailable()
  return res.json() as Promise<{ id: string }>
}

/**
 * Upload one file, reporting progress.
 *
 * XHR rather than fetch: fetch still has no upload progress event, and a
 * 400 MB album transferring with no feedback is indistinguishable from a
 * hang.
 */
export function uploadFile(
  batchId: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<{ name: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    // The album folder, when the browser gives us one. beets groups a release
    // by directory, so flattening the drop loses the strongest hint about
    // what the album actually is.
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    if (relative) form.append('relative_path', relative)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/import/batches/${batchId}/files`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1)
        resolve(JSON.parse(xhr.responseText))
      } else {
        // The server explains why it refused; show that rather than a code.
        let detail = `upload failed (${xhr.status})`
        try { detail = JSON.parse(xhr.responseText).detail ?? detail } catch { /* keep */ }
        reject(new Error(detail))
      }
    }
    xhr.onerror = () => reject(new Error('the connection dropped'))
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort())

    xhr.send(form)
  })
}

export async function startBatch(batchId: string): Promise<void> {
  const res = await fetch(`/api/import/batches/${batchId}/start`, { method: 'POST' })
  if (!res.ok) throw new Error(`could not start the import (${res.status})`)
}

export async function getBatch(batchId: string): Promise<ImportBatch> {
  return get<ImportBatch>(`/api/import/batches/${batchId}`)
}

export async function listBatches(): Promise<ImportBatch[]> {
  return get<ImportBatch[]>('/api/import/batches')
}

export async function discardBatch(batchId: string): Promise<void> {
  await fetch(`/api/import/batches/${batchId}`, { method: 'DELETE' })
}
