import { describe, expect, it } from 'vitest'
import { computeGain, dbToLinear, linearToDb } from '../src/replaygain.js'
import { DEFAULT_GAIN } from '../src/types.js'
import type { Track } from '../src/types.js'

const base: Track = {
  id: '1', title: 'Allah Hoo Allah Hoo', artist: 'Nusrat Fateh Ali Khan',
  album: 'Shahen-shah', duration: 400,
}

describe('dB conversion', () => {
  it('round-trips', () => {
    expect(dbToLinear(0)).toBeCloseTo(1, 10)
    expect(linearToDb(dbToLinear(-8.42))).toBeCloseTo(-8.42, 10)
  })
  it('halves amplitude at about -6 dB', () => {
    expect(dbToLinear(-6.02)).toBeCloseTo(0.5, 3)
  })
})

describe('computeGain', () => {
  it('is a no-op when disabled', () => {
    const g = computeGain({ ...base, replayGainAlbumDb: -8.4 },
      { ...DEFAULT_GAIN, mode: 'off' })
    expect(g.linear).toBe(1)
    expect(g.appliedDb).toBe(0)
  })

  it('prefers album gain in album mode — the record stays as sequenced', () => {
    const g = computeGain(
      { ...base, replayGainAlbumDb: -8.42, replayGainTrackDb: -10.1 },
      { ...DEFAULT_GAIN, mode: 'album' })
    expect(g.appliedDb).toBeCloseTo(-8.42, 5)
  })

  it('prefers track gain in track mode', () => {
    const g = computeGain(
      { ...base, replayGainAlbumDb: -8.42, replayGainTrackDb: -10.1 },
      { ...DEFAULT_GAIN, mode: 'track' })
    expect(g.appliedDb).toBeCloseTo(-10.1, 5)
  })

  it('falls back to the other tag when the preferred one is missing', () => {
    const g = computeGain({ ...base, replayGainTrackDb: -7 },
      { ...DEFAULT_GAIN, mode: 'album' })
    expect(g.appliedDb).toBeCloseTo(-7, 5)
    expect(g.untagged).toBe(false)
  })

  it('flags genuinely untagged tracks and leaves them alone', () => {
    // Two tracks in this library have no ReplayGain at all.
    const g = computeGain(base, DEFAULT_GAIN)
    expect(g.untagged).toBe(true)
    expect(g.linear).toBeCloseTo(1, 10)
  })

  it('applies preamp on top of the tag', () => {
    const g = computeGain({ ...base, replayGainAlbumDb: -8 },
      { ...DEFAULT_GAIN, preampDb: 3 })
    expect(g.appliedDb).toBeCloseTo(-5, 5)
  })

  it('pulls the gain back rather than clipping', () => {
    // +6 dB asked for, but the track already peaks at 0.9.
    const g = computeGain(
      { ...base, replayGainAlbumDb: 6, replayGainAlbumPeak: 0.9 },
      { ...DEFAULT_GAIN, preventClipping: true })
    expect(g.clippingPrevented).toBe(true)
    expect(g.linear * 0.9).toBeLessThanOrEqual(1.0000001)
  })

  it('leaves quiet tracks untouched by the clipping guard', () => {
    const g = computeGain(
      { ...base, replayGainAlbumDb: -8.42, replayGainAlbumPeak: 0.98 },
      DEFAULT_GAIN)
    expect(g.clippingPrevented).toBe(false)
    expect(g.appliedDb).toBeCloseTo(-8.42, 5)
  })

  it('will clip if you insist', () => {
    const g = computeGain(
      { ...base, replayGainAlbumDb: 6, replayGainAlbumPeak: 0.9 },
      { ...DEFAULT_GAIN, preventClipping: false })
    expect(g.clippingPrevented).toBe(false)
    expect(g.linear * 0.9).toBeGreaterThan(1)
  })
})
