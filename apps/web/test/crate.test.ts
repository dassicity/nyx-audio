import { describe, expect, it } from 'vitest'
import { BURY_MS, selectCandidates } from '../src/crate/select.js'
import type { SubsonicAlbum } from '../src/api/types.js'

const NOW = Date.parse('2026-09-01T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

const album = (over: Partial<SubsonicAlbum> & { id: string }): SubsonicAlbum => ({
  name: 'Album', artist: 'Artist', songCount: 8, duration: 2400, ...over,
})

describe('selectCandidates', () => {
  it('ranks never-played above merely cold', () => {
    const picks = selectCandidates([
      album({ id: 'cold', playCount: 9, played: daysAgo(700) }),
      album({ id: 'never', playCount: 0, created: daysAgo(300) }),
    ], {}, NOW)
    expect(picks[0]!.album.id).toBe('never')
  })

  it('excludes recent listening — under 90 days is not digging', () => {
    const picks = selectCandidates([
      album({ id: 'recent', playCount: 4, played: daysAgo(30) }),
      album({ id: 'old', playCount: 4, played: daysAgo(400) }),
    ], {}, NOW)
    expect(picks.map((p) => p.album.id)).toEqual(['old'])
  })

  it('orders the cold ones by how cold', () => {
    const picks = selectCandidates([
      album({ id: 'a', playCount: 1, played: daysAgo(120) }),
      album({ id: 'b', playCount: 1, played: daysAgo(900) }),
      album({ id: 'c', playCount: 1, played: daysAgo(400) }),
    ], {}, NOW)
    expect(picks.map((p) => p.album.id)).toEqual(['b', 'c', 'a'])
  })

  it('honours a burial for a year, then lets it back', () => {
    const albums = [album({ id: 'x', playCount: 0, created: daysAgo(500) })]
    expect(selectCandidates(albums, { x: NOW - 1000 }, NOW)).toHaveLength(0)
    expect(selectCandidates(albums, { x: NOW - BURY_MS - 1000 }, NOW)).toHaveLength(1)
  })

  it('states the reason in words, since that is the whole feature', () => {
    const [never] = selectCandidates(
      [album({ id: 'n', playCount: 0, created: daysAgo(400) })], {}, NOW)
    expect(never!.reason).toMatch(/^Never played\./)
    expect(never!.reason).toContain('months')

    const [cold] = selectCandidates(
      [album({ id: 'c', playCount: 9, played: daysAgo(500) })], {}, NOW)
    expect(cold!.reason).toMatch(/haven't played this since \d+ \w+ \d{4}/)
    expect(cold!.reason).toContain('9 plays')
  })

  it('says "play" not "plays" for one', () => {
    const [c] = selectCandidates(
      [album({ id: 'c', playCount: 1, played: daysAgo(500) })], {}, NOW)
    expect(c!.reason).toContain('1 play,')
  })

  it('copes with missing dates rather than showing Invalid Date', () => {
    const picks = selectCandidates([
      album({ id: 'nodate', playCount: 3 }),
      album({ id: 'nocreated', playCount: 0 }),
    ], {}, NOW)
    expect(picks).toHaveLength(2)
    for (const p of picks) expect(p.reason).not.toMatch(/Invalid|NaN|undefined/)
  })

  it('returns nothing when the whole crate has been dug', () => {
    expect(selectCandidates([], {}, NOW)).toEqual([])
    expect(selectCandidates(
      [album({ id: 'r', playCount: 2, played: daysAgo(3) })], {}, NOW)).toEqual([])
  })
})

// The series gap: the design handoff has no concept of a numbered concert
// series, and its mock data could not have surfaced the need. This library
// has a 22-volume one.
import { detectSeries } from '../src/screens/Artists.js'

describe('detectSeries', () => {
  it('spots a numbered concert series', () => {
    const s = detectSeries([
      'Aston University UK Concert 1988, Vol. 141',
      'Barbican Centre UK Concert 1993, Vol. 151',
      'Coventry UK Concert 1985, Vol. 160',
      'Leicester UK Concert 1985, Vol. 155',
      'Southall UK Concert 1983, Vol. 161',
    ])
    expect(s).not.toBeNull()
    expect(s!.count).toBe(5)
  })

  it('ignores an artist with a few discrete albums', () => {
    expect(detectSeries(['Shahen-shah', 'Night Song', 'Rapture'])).toBeNull()
  })

  it('needs more than a couple of volumes before calling it a series', () => {
    expect(detectSeries(['Live Vol. 1', 'Live Vol. 2', 'Live Vol. 3'])).toBeNull()
  })

  it('handles "Vol" without a full stop', () => {
    const s = detectSeries(Array.from({ length: 6 }, (_, i) => `Sessions Vol ${i + 1}`))
    expect(s?.count).toBe(6)
  })

  it('finds the shared label', () => {
    const s = detectSeries(Array.from({ length: 5 },
      (_, i) => `Mehfil-e-Sama Recordings, Vol. ${i + 10}`))
    expect(s?.label).toContain('Mehfil-e-Sama')
  })
})

describe('describeSpan pluralisation', () => {
  it('says "1 day", not "1 days"', () => {
    const [c] = selectCandidates(
      [album({ id: 'x', playCount: 0, created: daysAgo(1) })], {}, NOW)
    expect(c!.reason).toContain('1 day,')
    expect(c!.reason).not.toContain('1 days')
  })
  it('still pluralises everything else', () => {
    const [c] = selectCandidates(
      [album({ id: 'y', playCount: 0, created: daysAgo(5) })], {}, NOW)
    expect(c!.reason).toContain('5 days')
  })
})

// Scrobble threshold: half the track, or four minutes, whichever is sooner.
// Without a cap, a 26-minute qawwali would need 13 minutes to register.
describe('scrobble threshold', () => {
  const threshold = (duration: number) => Math.min(duration * 0.5, 240)

  it('is half of an ordinary song', () => {
    expect(threshold(240)).toBe(120)
  })
  it('caps at four minutes for long-form material', () => {
    expect(threshold(22 * 60)).toBe(240)
    expect(threshold(26 * 60)).toBe(240)
  })
  it('never exceeds the track itself', () => {
    for (const d of [30, 90, 200, 480, 1560]) {
      expect(threshold(d)).toBeLessThanOrEqual(d)
    }
  })
})
