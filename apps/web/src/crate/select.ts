/**
 * Crate digging — an explicit anti-algorithm.
 *
 * Not recommendation. The opposite: surface records you already own and have
 * not played, and say plainly why each one surfaced. No engagement loop, no
 * infinite scroll, no inference about what you might like.
 */
import type { SubsonicAlbum } from '../api/types.js'

export interface Buried { [albumId: string]: number } // id → epoch ms of burial

export const BURY_MS = 365 * 24 * 60 * 60 * 1000

export interface Candidate {
  album: SubsonicAlbum
  /** Why this surfaced — shown verbatim. The point of the feature. */
  reason: string
  /** Higher is colder. Used only for ordering. */
  coldness: number
}

function daysBetween(a: number, b: number): number {
  return Math.floor(Math.abs(a - b) / 86_400_000)
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

/**
 * Rank the library by how long it has been ignored.
 *
 * Never-played records rank above merely-cold ones: an album bought and never
 * heard is a more interesting thing to be reminded of than one you played
 * last year.
 */
export function selectCandidates(
  albums: SubsonicAlbum[],
  buried: Buried,
  now: number,
): Candidate[] {
  const out: Candidate[] = []

  for (const album of albums) {
    const buriedAt = buried[album.id]
    if (buriedAt !== undefined && now - buriedAt < BURY_MS) continue

    const plays = album.playCount ?? 0
    const lastPlayed = album.played ? Date.parse(album.played) : NaN
    const acquired = album.created ? Date.parse(album.created) : NaN

    if (plays === 0) {
      const shelved = Number.isFinite(acquired) ? daysBetween(now, acquired) : null
      out.push({
        album,
        coldness: 1_000_000 + (shelved ?? 0),
        reason: shelved !== null
          ? `Never played. On the shelf ${describeSpan(shelved)}, since the day it was ripped.`
          : 'Never played. It has been on the shelf since the day it was ripped.',
      })
      continue
    }

    if (!Number.isFinite(lastPlayed)) {
      out.push({
        album, coldness: 500_000,
        reason: `${plays} ${plays === 1 ? 'play' : 'plays'}, but nothing recorded about when.`,
      })
      continue
    }

    const since = daysBetween(now, lastPlayed)
    // Under three months is not "digging" — it is just your recent listening.
    if (since < 90) continue

    out.push({
      album, coldness: since,
      reason: `You haven't played this since ${formatDate(lastPlayed)}. ` +
        `${plays} ${plays === 1 ? 'play' : 'plays'}, all of them before then.`,
    })
  }

  return out.sort((a, b) => b.coldness - a.coldness)
}

function describeSpan(days: number): string {
  if (days === 1) return '1 day'
  if (days < 60) return `${days} days`
  const months = Math.round(days / 30)
  if (months < 24) return `${months} months`
  return `${(days / 365).toFixed(1)} years`
}

// ── burial persistence ───────────────────────────────────────────────────
const KEY = 'nyx.crate.buried'

export function loadBuried(): Buried {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    // Drop expired burials on read so the file cannot grow forever.
    const now = Date.now()
    const out: Buried = {}
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === 'number' && now - at < BURY_MS) out[id] = at
    }
    return out
  } catch {
    return {}
  }
}

export function bury(id: string, now = Date.now()): Buried {
  const next = { ...loadBuried(), [id]: now }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* non-fatal */ }
  return next
}
