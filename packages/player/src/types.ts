/** A track as the engine needs to see it. Deliberately not Subsonic-shaped:
 *  the engine must not know what server it is talking to. */
export interface Track {
  id: string
  title: string
  artist: string
  album: string
  /** Seconds. From tags — treated as advisory, not authoritative. */
  duration: number
  /** ReplayGain, in dB, as written by beets. Absent on untagged tracks. */
  replayGainTrackDb?: number
  replayGainAlbumDb?: number
  /** Sample peak, 0..1+. Used only to hold back clipping. */
  replayGainTrackPeak?: number
  replayGainAlbumPeak?: number
}

export type ReplayGainMode = 'track' | 'album' | 'off'

/** Which playback path a track takes. See docs/tech-stack.md D7. */
export type PlaybackPath = 'buffer' | 'stream'

export interface GainSettings {
  mode: ReplayGainMode
  /** Applied on top of the tag value. 0 dB is correct for a curated library. */
  preampDb: number
  /** Pull the gain back when the tags say the result would clip. */
  preventClipping: boolean
  /** Used when a track carries no ReplayGain tag at all. */
  untaggedDb: number
}

export const DEFAULT_GAIN: GainSettings = {
  mode: 'album',
  preampDb: 0,
  preventClipping: true,
  untaggedDb: 0,
}
