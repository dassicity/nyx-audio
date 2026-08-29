/**
 * ReplayGain.
 *
 * Without this, a 1980s pressing and a modern remaster differ by ~10 dB and
 * every shuffle is a jump scare. beets wrote these tags during import; the
 * engine's only job is to turn them into a linear gain for a GainNode.
 */
import type { GainSettings, Track } from './types.js'

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20)
}

export function linearToDb(linear: number): number {
  return 20 * Math.log10(linear)
}

export interface GainResult {
  /** What to set on the GainNode. */
  linear: number
  /** The dB actually applied, after preamp and any clipping pullback. */
  appliedDb: number
  /** True when the tag value was reduced to stop the output clipping. */
  clippingPrevented: boolean
  /** True when the track carried no usable tag and the fallback was used. */
  untagged: boolean
}

/**
 * Album mode preserves the record as it was sequenced — quiet interludes stay
 * quiet relative to the loud passages. That is the right default for a library
 * organised around albums, and it is why `mode` defaults to 'album'.
 */
export function computeGain(track: Track, settings: GainSettings): GainResult {
  if (settings.mode === 'off') {
    return { linear: 1, appliedDb: 0, clippingPrevented: false, untagged: false }
  }

  const preferAlbum = settings.mode === 'album'
  const tagDb = preferAlbum
    ? track.replayGainAlbumDb ?? track.replayGainTrackDb
    : track.replayGainTrackDb ?? track.replayGainAlbumDb

  const untagged = tagDb === undefined
  const baseDb = tagDb ?? settings.untaggedDb

  let appliedDb = baseDb + settings.preampDb
  let clippingPrevented = false

  if (settings.preventClipping) {
    const peak = preferAlbum
      ? track.replayGainAlbumPeak ?? track.replayGainTrackPeak
      : track.replayGainTrackPeak ?? track.replayGainAlbumPeak

    if (peak !== undefined && peak > 0) {
      // Largest gain that keeps peak * gain <= 1.0
      const headroomDb = linearToDb(1 / peak)
      if (appliedDb > headroomDb) {
        appliedDb = headroomDb
        clippingPrevented = true
      }
    }
  }

  return {
    linear: dbToLinear(appliedDb),
    appliedDb,
    clippingPrevented,
    untagged,
  }
}
