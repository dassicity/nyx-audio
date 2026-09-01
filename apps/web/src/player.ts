/**
 * Binds the headless engine to React via Zustand.
 *
 * The engine owns playback; this is only a subscription so components can
 * render it. Playback state updates several times a second and deliberately
 * does not go through TanStack Query (D6).
 */
import { create } from 'zustand'
import { NyxPlayer } from '@nyx/player'
import type { PlayerState, Track } from '@nyx/player'
import type { SubsonicClient } from './api/subsonic.js'
import type { SubsonicSong } from './api/types.js'

/** OpenSubsonic song → the engine's Track. ReplayGain comes straight from
 *  the tags beets wrote at import. */
export function toTrack(song: SubsonicSong): Track {
  const t: Track = {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    duration: song.duration,
  }
  const rg = song.replayGain
  if (rg?.trackGain !== undefined) t.replayGainTrackDb = rg.trackGain
  if (rg?.albumGain !== undefined) t.replayGainAlbumDb = rg.albumGain
  if (rg?.trackPeak !== undefined) t.replayGainTrackPeak = rg.trackPeak
  if (rg?.albumPeak !== undefined) t.replayGainAlbumPeak = rg.albumPeak
  return t
}

/** Report a play once it is genuinely a play, not a skip. */
const SCROBBLE_AFTER_FRACTION = 0.5
const SCROBBLE_AFTER_SECONDS = 240 // long-form: four minutes is commitment enough

interface PlayerStore extends PlayerState {
  engine: NyxPlayer | null
  attach: (client: SubsonicClient) => NyxPlayer
  playAlbum: (songs: SubsonicSong[], startIndex?: number) => void
}

const EMPTY: PlayerState = {
  queue: [], index: -1, status: 'idle', position: 0, duration: 0,
  path: null, gain: null, outputSampleRate: 0, error: null,
}

export const usePlayer = create<PlayerStore>((set, get) => ({
  ...EMPTY,
  engine: null,

  attach(client) {
    const existing = get().engine
    if (existing) return existing

    const engine = new NyxPlayer({
      // 44.1 kHz is the library's native rate, so this avoids resampling for
      // almost everything — and lets the signal path report the truth.
      createContext: () => new AudioContext({ sampleRate: 44100 }),
      fetchAudio: async (track, signal) => {
        const res = await fetch(client.streamUrl(track.id), { signal })
        if (!res.ok) throw new Error(`stream ${res.status}`)
        return res.arrayBuffer()
      },
      streamUrl: (track) => client.streamUrl(track.id),
      createAudioElement: () => {
        const el = new Audio()
        el.preload = 'auto'
        return el
      },
      mediaSession: 'mediaSession' in navigator ? navigator.mediaSession : null,
    })

    // Report plays to Navidrome. Without this, playCount never increments,
    // which quietly breaks crate mode — everything looks unplayed forever.
    // Nothing else writes this data today; nyx-api will own the richer log.
    const scrobbled = new Set<string>()
    engine.subscribe((s) => {
      set(s)
      const track = s.queue[s.index]
      if (!track || s.status !== 'playing') return
      if (scrobbled.has(track.id)) return

      // A play is half the track, or four minutes — whichever comes first.
      // A 26-minute movement should not need thirteen minutes to count.
      const threshold = Math.min(track.duration * SCROBBLE_AFTER_FRACTION, SCROBBLE_AFTER_SECONDS)
      if (s.position < threshold) return

      scrobbled.add(track.id)
      void client.scrobble(track.id, true).catch(() => {
        // A failed scrobble must never interrupt playback. Allow a retry
        // if the track comes round again.
        scrobbled.delete(track.id)
      })
    })
    set({ engine })
    return engine
  },

  playAlbum(songs, startIndex = 0) {
    const engine = get().engine
    if (!engine) return
    void engine.load(songs.map(toTrack), startIndex)
  },
}))
