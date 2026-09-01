/** OpenSubsonic shapes, narrowed to what Nyx actually reads. */

export interface SubsonicAlbum {
  id: string
  name: string
  artist: string
  artistId?: string
  coverArt?: string
  songCount: number
  duration: number
  year?: number
  genre?: string
  created?: string
  playCount?: number
  /** OpenSubsonic: ISO timestamp of the most recent play. Navidrome sets it;
   *  older Subsonic servers do not, which crate mode handles. */
  played?: string
  /** ISO timestamp when starred, or absent. */
  starred?: string
}

export interface SubsonicSong {
  id: string
  title: string
  album: string
  artist: string
  albumId?: string
  track?: number
  discNumber?: number
  year?: number
  duration: number
  /** 'FLAC', 'MP3' — Navidrome reports the container. */
  suffix?: string
  bitRate?: number
  /** OpenSubsonic extensions. Absent on older servers. */
  bitDepth?: number
  samplingRate?: number
  channelCount?: number
  playCount?: number
  coverArt?: string
  /** OpenSubsonic ReplayGain block. */
  replayGain?: {
    trackGain?: number
    albumGain?: number
    trackPeak?: number
    albumPeak?: number
  }
}

export interface SubsonicArtist {
  id: string
  name: string
  albumCount?: number
  coverArt?: string
}

export interface ScanStatus {
  scanning: boolean
  count?: number
  folderCount?: number
  lastScan?: string
}

export class SubsonicError extends Error {
  constructor(readonly code: number, message: string) {
    super(message)
    this.name = 'SubsonicError'
  }
}

/** Subsonic error codes worth distinguishing in the UI. */
export const SUBSONIC_WRONG_CREDENTIALS = 40
export const SUBSONIC_REQUIRES_UPGRADE = 30

export interface SubsonicPlaylist {
  id: string
  name: string
  songCount: number
  duration: number
  coverArt?: string
  comment?: string
}
